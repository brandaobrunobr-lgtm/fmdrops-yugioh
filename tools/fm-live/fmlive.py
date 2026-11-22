"""FMDrops — ponte entre o jogo (YFM Re-Decomp) e o painel de live.

Lê o baú e o deck do jogo e entrega em http://127.0.0.1:8765/estado.
O mesmo servidor serve o site (pasta do repositório), então no OBS basta:
    http://127.0.0.1:8765/live.html?jogo=1

De onde vêm os dados (nessa ordem):
  1. memória do memories-pc.exe, só leitura. O Re-Decomp põe a RAM do PS1 no
     endereço real dela (0x80000000), então o baú fica em 0x801D0250.
  2. o save do jogo (Documents/My Games/YFM Re-Decomp/saves/slotNN.sav),
     que só muda quando você salva no jogo.

Não precisa instalar nada: só Python 3 (biblioteca padrão). Não envia nada
para a internet e só aceita conexões deste PC (127.0.0.1).
Uso: python fmlive.py [--porta 8765] [--saves PASTA] [--so-save]
"""
import argparse
import base64
import ctypes
import hashlib
import re
import socket
import ctypes.wintypes as wt
import glob
import http.server
import json
import os
import struct
import sys
import threading
import time

TOTAL = 722
DECK = 40
# deslocamentos dentro do bloco de estado do save (sdk/include/game/save_data.h)
OFF_DECK, OFF_TRUNK, OFF_CODE, OFF_RECENT, OFF_CHIPS = 0x000, 0x050, 0x334, 0x5BC, 0x5E0
RAM_STATE = 0x801D0200          # bloco de estado vivo (0x801D0000 + cabeçalho 0x200)
SAVE_STATE = 0x200              # mesmo bloco dentro do arquivo .sav
SIDES = 0x800E9FF0              # 2 registros de 0x20 por lado; LP em +0x14 (duel_side_state.h)
WINNER = 0x8009B238             # s8: -1 durante o duelo, depois o lado vencedor
OPPONENT = 0x8009B361           # s8: gDuel_bOpponentID, mesma numeração dos duelistas do site
STATE_LEN = 0x5E4
PROC = "memories-pc.exe"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ORIGENS = {"https://brandaobrunobr-lgtm.github.io"}


def analisa(bloco):
    """bloco = 0x5E4 bytes do estado. Devolve dict ou None se não parece um save carregado."""
    if len(bloco) < STATE_LEN:
        return None
    deck = struct.unpack_from("<40H", bloco, OFF_DECK)
    trunk = bloco[OFF_TRUNK:OFF_TRUNK + TOTAL]
    code = struct.unpack_from("<I", bloco, OFF_CODE)[0]
    # sem save carregado (tela de título) o bloco está zerado ou com lixo
    if code == 0 or not all(1 <= c <= TOTAL for c in deck) or max(trunk) > 250:
        return None
    recent = [c for c in struct.unpack_from("<16H", bloco, OFF_RECENT) if 1 <= c <= TOTAL]
    chips = struct.unpack_from("<I", bloco, OFF_CHIPS)[0]
    cartas = sorted({i + 1 for i, n in enumerate(trunk) if n} | set(deck))
    cont = [0] + list(trunk)            # cópias de cada carta: baú + deck (índice = id)
    for c in deck:
        cont[c] += 1
    return {"duelista": "%08X" % code, "cartas": cartas, "deck": list(deck),
            "recentes": recent, "starchips": chips, "copias": sum(trunk) + DECK, "_cont": cont}


# ---------------- memória do processo (Windows) ----------------
k32 = ctypes.WinDLL("kernel32", use_last_error=True) if os.name == "nt" else None


class PE32(ctypes.Structure):
    _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD), ("th32ProcessID", wt.DWORD),
                ("th32DefaultHeapID", ctypes.c_void_p), ("th32ModuleID", wt.DWORD),
                ("cntThreads", wt.DWORD), ("th32ParentProcessID", wt.DWORD),
                ("pcPriClassBase", ctypes.c_long), ("dwFlags", wt.DWORD), ("szExeFile", ctypes.c_wchar * 260)]


if k32:
    k32.CreateToolhelp32Snapshot.restype = wt.HANDLE
    k32.OpenProcess.restype = wt.HANDLE
    k32.ReadProcessMemory.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t,
                                      ctypes.POINTER(ctypes.c_size_t)]
    k32.GetExitCodeProcess.argtypes = [wt.HANDLE, ctypes.POINTER(wt.DWORD)]


def acha_pids():
    """Todos os memories-pc.exe: o jogo abre dois (o jogo e um monitor que não tem a RAM do PS1)."""
    pids = []
    snap = k32.CreateToolhelp32Snapshot(0x2, 0)
    if snap in (None, wt.HANDLE(-1).value):
        return pids
    try:
        e = PE32(); e.dwSize = ctypes.sizeof(PE32)
        ok = k32.Process32FirstW(snap, ctypes.byref(e))
        while ok:
            if e.szExeFile.lower() == PROC:
                pids.append(e.th32ProcessID)
            ok = k32.Process32NextW(snap, ctypes.byref(e))
    finally:
        k32.CloseHandle(snap)
    return pids


class Memoria:
    def __init__(self):
        self.h = None

    def fecha(self):
        if self.h:
            k32.CloseHandle(self.h)
        self.h = None

    def le(self):
        if not k32:
            return None
        if self.h:
            st = wt.DWORD()
            if not k32.GetExitCodeProcess(self.h, ctypes.byref(st)) or st.value != 259:  # STILL_ACTIVE
                self.fecha()
        if self.h:
            b = self._le(self.h)
            if b is not None:
                return b
            self.fecha()
        # procura o processo cuja RAM do PS1 dá para ler (o monitor não tem)
        for pid in acha_pids():
            # PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION: só leitura
            h = k32.OpenProcess(0x0010 | 0x1000, False, pid)
            if not h:
                continue
            b = self._le(h)
            if b is not None:
                self.h = h
                return b
            k32.CloseHandle(h)
        return None

    def ler(self, endereco, n):
        """Lê n bytes da RAM do PS1 no processo já aberto (ou None)."""
        if not self.h:
            return None
        buf = ctypes.create_string_buffer(n)
        k = ctypes.c_size_t()
        if not k32.ReadProcessMemory(self.h, endereco, buf, n, ctypes.byref(k)) or k.value != n:
            return None
        return buf.raw

    @staticmethod
    def _le(h):
        buf = ctypes.create_string_buffer(STATE_LEN)
        n = ctypes.c_size_t()
        if not k32.ReadProcessMemory(h, RAM_STATE, buf, STATE_LEN, ctypes.byref(n)) or n.value != STATE_LEN:
            return None
        return buf.raw


def pasta_saves():
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    try:  # pasta Documentos real (pode ter sido movida)
        b = ctypes.create_unicode_buffer(260)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, b) == 0:
            docs = b.value
    except Exception:
        pass
    return os.path.join(docs, "My Games", "YFM Re-Decomp", "saves")


def le_save(pasta):
    arqs = glob.glob(os.path.join(pasta, "slot*.sav"))
    if not arqs:
        return None, None
    arq = max(arqs, key=os.path.getmtime)   # o último save feito
    with open(arq, "rb") as f:
        b = f.read()
    return b[SAVE_STATE:SAVE_STATE + STATE_LEN], os.path.basename(arq)


# ---------------- OBS: um vídeo por duelo (obs-websocket 5, só neste PC) ----------------
class OBS:
    """Cliente mínimo do obs-websocket v5 (biblioteca padrão). A senha é lida da própria
    configuração do OBS deste usuário, então nunca aparece em lugar nenhum."""

    def __init__(self):
        self.s = None
        self.rid = 0

    @staticmethod
    def config():
        arq = os.path.join(os.environ.get("APPDATA", ""), "obs-studio", "plugin_config", "obs-websocket", "config.json")
        try:
            with open(arq, encoding="utf-8") as f:
                c = json.load(f)
            return c if c.get("server_enabled") else None
        except (OSError, ValueError):
            return None

    def _envia(self, obj):
        dado = json.dumps(obj).encode()
        cab = bytearray([0x81])
        n = len(dado)
        if n < 126:
            cab.append(0x80 | n)
        elif n < 65536:
            cab += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            cab += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        self.s.sendall(bytes(cab) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(dado)))

    def _exato(self, n):
        b = b""
        while len(b) < n:
            p = self.s.recv(n - len(b))
            if not p:
                raise ConnectionError("OBS fechou a conexão")
            b += p
        return b

    def _recebe(self):
        while True:
            h = self._exato(2)
            op, n = h[0] & 0x0F, h[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exato(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exato(8))[0]
            dado = self._exato(n)
            if op == 1:
                return json.loads(dado)
            if op == 8:
                raise ConnectionError("OBS fechou a conexão")
            if op == 9:                                   # ping -> pong
                self.s.sendall(bytes([0x8A, 0x80 | len(dado)]) + b"\0\0\0\0" + dado)

    def conecta(self):
        c = self.config()
        if not c:
            raise ConnectionError("controle remoto do OBS desligado")
        s = socket.create_connection(("127.0.0.1", int(c.get("server_port", 4455))), timeout=4)
        chave = base64.b64encode(os.urandom(16)).decode()
        s.sendall(("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                   "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n"
                   "Sec-WebSocket-Protocol: obswebsocket.json\r\n\r\n" % chave).encode())
        r = b""
        while b"\r\n\r\n" not in r:
            p = s.recv(1024)
            if not p:
                raise ConnectionError("OBS recusou a conexão")
            r += p
        if b" 101 " not in r.split(b"\r\n", 1)[0]:
            raise ConnectionError("OBS recusou a conexão")
        self.s = s
        hello = self._recebe()["d"]
        ident = {"rpcVersion": 1, "eventSubscriptions": 0}
        a = hello.get("authentication")
        if a:
            seg = base64.b64encode(hashlib.sha256((c.get("server_password", "") + a["salt"]).encode()).digest()).decode()
            ident["authentication"] = base64.b64encode(hashlib.sha256((seg + a["challenge"]).encode()).digest()).decode()
        self._envia({"op": 1, "d": ident})
        if self._recebe().get("op") != 2:
            raise ConnectionError("senha do OBS recusada")

    def pede(self, tipo, dados=None):
        for tentativa in (1, 2):
            try:
                if not self.s:
                    self.conecta()
                self.rid += 1
                rid = str(self.rid)
                self._envia({"op": 6, "d": {"requestType": tipo, "requestId": rid, "requestData": dados or {}}})
                while True:
                    m = self._recebe()
                    if m.get("op") == 7 and m["d"].get("requestId") == rid:
                        return m["d"]
            except (OSError, ConnectionError, ValueError, KeyError):
                self.fecha()
                if tentativa == 2:
                    raise

    def fecha(self):
        try:
            if self.s:
                self.s.close()
        except OSError:
            pass
        self.s = None


class Gravador:
    """Começa a gravar quando um duelo começa e para depois do resultado e dos drops.
    O vídeo ganha o nome do oponente e o resultado. As chamadas ao OBS rodam numa fila
    à parte, para nunca atrasar a leitura do jogo."""

    def __init__(self, nomes):
        self.nomes = nomes
        self.obs = OBS()
        self.fila = []
        self.cv = threading.Condition()
        self.estado = "parado"         # parado | gravando | finalizando
        self.info = {}
        self.confirmado, self.tentou = False, 0.0
        threading.Thread(target=self._trabalha, daemon=True).start()

    def ativo(self):
        return OBS.config() is not None

    def _manda(self, acao, info=None):
        with self.cv:
            self.fila.append((acao, dict(info or {})))
            self.cv.notify()

    def _trabalha(self):
        while True:
            with self.cv:
                while not self.fila:
                    self.cv.wait()
                acao, info = self.fila.pop(0)
            try:
                if acao == "inicia":
                    st = self.obs.pede("GetRecordStatus")
                    if st.get("responseData", {}).get("outputActive"):
                        self.obs.pede("StopRecord")      # fecha um vídeo antigo que ficou aberto
                        time.sleep(1.5)
                    self.obs.pede("StartRecord")
                    self.confirmado = True
                    print(time.strftime("%H:%M:%S"), "gravação: começou (duelo vs %s)" % info.get("op"), flush=True)
                elif acao == "para":
                    r = self.obs.pede("StopRecord")
                    caminho = (r.get("responseData") or {}).get("outputPath")
                    print(time.strftime("%H:%M:%S"), "gravação: parou", flush=True)
                    if caminho:
                        self._renomeia(caminho, info)
            except Exception as e:
                print(time.strftime("%H:%M:%S"), "gravação: OBS não respondeu (%s)" % e, flush=True)

    def _renomeia(self, caminho, info):
        pasta, nome = os.path.split(caminho)
        base, ext = os.path.splitext(nome)
        rot = {"vitoria": "vitória", "derrota": "derrota"}.get(info.get("resultado"), "sem resultado")
        extra = re.sub(r'[\\/:*?"<>|]', "", " - vs %s - %s" % (info.get("op") or "?", rot))
        novo = os.path.join(pasta, base + extra + ext)
        for _ in range(20):            # o OBS pode segurar o arquivo por um instante
            try:
                os.replace(caminho, novo)
                print(time.strftime("%H:%M:%S"), "vídeo salvo:", novo, flush=True)
                return
            except OSError:
                time.sleep(0.5)

    def tick(self, duelo, opp, novos_drops):
        """Chamado a cada leitura do jogo. duelo = None quando não há jogo aberto."""
        agora = time.time()
        if duelo is None:
            if self.estado != "parado":
                self._encerra()
            return
        if duelo["comecou"]:
            if self.estado != "parado":
                self._encerra()
            self.info = {"op": self.nomes.get(opp, "duelista %s" % opp), "inicio": agora}
            self.estado, self.confirmado, self.tentou = "gravando", False, agora
            self._manda("inicia", self.info)
            return
        # OBS ainda fechado quando o duelo começou: tenta de novo a cada 10 s
        if self.estado == "gravando" and not self.confirmado and not duelo["fim"] and agora - self.tentou > 10:
            self.tentou = agora
            self._manda("inicia", self.info)
        if self.estado == "gravando":
            if duelo["fim"]:
                self.info.update(resultado=duelo["fim"], fim=agora, ultimo_drop=None)
                self.estado = "finalizando"
            elif agora - self.info["inicio"] > 3600:      # segurança: no máximo 1 hora
                self._encerra()
        elif self.estado == "finalizando":
            if novos_drops:
                self.info["ultimo_drop"] = agora
            d, fim = self.info.get("ultimo_drop"), self.info["fim"]
            # para 6 s depois dos drops entrarem no baú (fim da tela de resultado);
            # na derrota não há drops: 20 s; e nunca mais que 3 min depois do fim
            if (d and agora - d > 6) or (self.info["resultado"] == "derrota" and agora - fim > 20) or agora - fim > 180:
                self._encerra()

    def _encerra(self):
        self._manda("para", self.info)
        self.estado = "parado"


# ---------------- estado compartilhado ----------------
class Estado:
    def __init__(self, saves, so_save):
        self.saves, self.so_save = saves, so_save
        self.mem = Memoria()
        self.atual = {"ok": False, "fonte": None, "msg": "iniciando"}
        self.lock = threading.Lock()
        self.ultimo = None
        # drops: cada carta que entrou (inclusive repetida), pela maior quantidade já vista
        # de cada id. Mover cartas no Build Deck não muda baú+deck, então não conta.
        self.duelista, self.maxi, self.drops, self.seq = None, None, [], 0
        # duelo: LP dos dois lados e vencedor -> eventos para o avatar
        self.lado = 0                     # registro do jogador em D_800E9FF0 (0 = você)
        self.lp, self.venc, self.eventos, self.eseq = None, None, [], 0
        self.oponente, self.grav = None, None

    def duelo(self):
        """LP e resultado do duelo, direto da memória. Gera eventos ataque/dano/vitoria/derrota."""
        s = self.mem.ler(SIDES, 0x40)
        v = self.mem.ler(WINNER, 1)
        if s is None or v is None:
            return None
        lp = [struct.unpack_from("<H", s, i * 0x20 + 0x14)[0] for i in (0, 1)]
        mx = [struct.unpack_from("<h", s, i * 0x20 + 0x16)[0] for i in (0, 1)]
        venc = struct.unpack("<b", v)[0]
        o = self.mem.ler(OPPONENT, 1)
        self.oponente = struct.unpack("<b", o)[0] if o else None
        eu, ele = self.lado, 1 - self.lado
        valido = all(0 < m <= 9999 for m in mx)          # antes do 1º duelo os registros estão zerados
        if self.lp is not None and valido:
            if lp[ele] < self.lp[ele]:
                self.evento("ataque", self.lp[ele] - lp[ele])
            if lp[eu] < self.lp[eu]:
                self.evento("dano", self.lp[eu] - lp[eu])
        fim = None
        if self.venc is not None and self.venc < 0 <= venc:
            fim = "vitoria" if venc == eu else "derrota"
            self.evento(fim, 0)
        # começo: o jogo zera o vencedor (-1) ao montar o duelo; ou o programa abriu no meio de um
        comecou = valido and venc < 0 and (self.venc is None or self.venc >= 0)
        self.lp, self.venc = lp, venc
        return {"lp": lp[eu], "lp_oponente": lp[ele], "em_duelo": venc < 0 and valido,
                "comecou": comecou, "fim": fim}

    def evento(self, tipo, valor):
        self.eseq += 1
        self.eventos = (self.eventos + [{"n": self.eseq, "tipo": tipo, "valor": valor, "t": time.time()}])[-20:]
        print(time.strftime("%H:%M:%S"), "evento:", tipo, valor or "", flush=True)

    def ciclo(self):
        while True:
            try:
                self.atualiza()
            except Exception as e:  # nunca derruba o servidor
                with self.lock:
                    self.atual = {"ok": False, "fonte": None, "msg": "erro: %s" % e}
            time.sleep(0.3)

    def atualiza(self):
        dados, fonte, msg = None, None, None
        if not self.so_save:
            bloco = self.mem.le()
            if bloco is not None:
                dados = analisa(bloco)
                fonte = "jogo" if dados else None
                if not dados:
                    msg = "jogo aberto, aguardando carregar o save"
        # jogo aberto sem save carregado: espera, em vez de mostrar um save antigo
        # (num jogo novo o save do disco é de outro duelista)
        if dados is None and msg is None:
            bloco, nome = le_save(self.saves)
            if bloco:
                dados = analisa(bloco)
                fonte = "save:" + nome if dados else None
        novos = []
        if dados:
            cont = dados.pop("_cont")
            if dados["duelista"] != self.duelista:      # outro save: recomeça
                self.duelista, self.maxi, self.drops = dados["duelista"], list(cont), []
            else:
                for cid in range(1, TOTAL + 1):
                    for k in range(max(0, cont[cid] - self.maxi[cid])):
                        novos.append((cid, self.maxi[cid] == 0 and k == 0, cont[cid]))
                    self.maxi[cid] = max(self.maxi[cid], cont[cid])
                # vários na mesma leitura (fim de duelo): na ordem da lista de recentes do jogo,
                # que tem o mais novo primeiro -> o último daqui é o último ganho
                rec = dados["recentes"]
                novos.sort(key=lambda x: -rec.index(x[0]) if x[0] in rec else -99)
                for cid, nova, cop in novos:
                    self.seq += 1
                    self.drops.append({"n": self.seq, "id": cid, "nova": nova, "copias": cop, "t": int(time.time())})
                    print(time.strftime("%H:%M:%S"), "drop:", cid, "(nova)" if nova else "", flush=True)
                self.drops = self.drops[-30:]
            dados["drops"] = list(self.drops)
            dados["duelo"] = self.duelo() if fonte == "jogo" else None
            dados["eventos"] = list(self.eventos)
            if self.grav:
                self.grav.tick(dados["duelo"], self.oponente, bool(novos))
            novo = {"ok": True, "fonte": fonte, "em": int(time.time()), **dados}
            if self.ultimo != dados["cartas"]:
                if self.ultimo is not None:
                    ganhou = sorted(set(dados["cartas"]) - set(self.ultimo))
                    if ganhou:
                        print(time.strftime("%H:%M:%S"), "nova(s) carta(s):", ganhou, flush=True)
                self.ultimo = dados["cartas"]
        else:
            novo = {"ok": False, "fonte": None, "em": int(time.time()),
                    "msg": msg or "jogo fechado e nenhum save encontrado"}
            if self.grav:
                self.grav.tick(None, None, False)          # jogo fechou: fecha o vídeo
        with self.lock:
            self.atual = novo

    def json(self):
        with self.lock:
            return json.dumps(self.atual, separators=(",", ":")).encode()


def servidor(estado, porta):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=REPO, **k)

        def log_message(self, *a):
            pass

        def cors(self):
            o = self.headers.get("Origin")
            if o in ORIGENS:
                self.send_header("Access-Control-Allow-Origin", o)
                self.send_header("Access-Control-Allow-Private-Network", "true")
                self.send_header("Vary", "Origin")

        def do_OPTIONS(self):
            self.send_response(204); self.cors()
            self.send_header("Access-Control-Allow-Methods", "GET")
            self.end_headers()

        def do_GET(self):
            if self.path.split("?")[0] == "/estado":
                b = estado.json()
                self.send_response(200); self.cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers(); self.wfile.write(b)
                return
            # teste do avatar sem jogar: /simular?ataque | dano | vitoria | derrota
            if self.path.startswith("/simular?"):
                tipo = self.path.split("?", 1)[1]
                if tipo in ("ataque", "dano", "vitoria", "derrota"):
                    estado.evento(tipo, 1000 if tipo in ("ataque", "dano") else 0)
                    self.send_response(204); self.end_headers(); return
                self.send_error(400); return
            # o site em si; nada fora da pasta do repositório nem arquivos ocultos
            p = self.path.split("?")[0]
            if "/." in p or p.startswith("/tools"):
                self.send_error(404); return
            super().do_GET()

        def end_headers(self):
            if not self.path.startswith("/estado"):
                self.send_header("Cache-Control", "no-cache")
            super().end_headers()

    http.server.ThreadingHTTPServer.allow_reuse_address = False
    return http.server.ThreadingHTTPServer(("127.0.0.1", porta), H)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--saves", default=pasta_saves())
    ap.add_argument("--so-save", action="store_true", help="não ler a memória do jogo")
    ap.add_argument("--teste", action="store_true", help="mostra o estado uma vez e sai")
    ap.add_argument("--sem-gravacao", action="store_true", help="não controla a gravação do OBS")
    a = ap.parse_args()
    est = Estado(a.saves, a.so_save)
    if a.teste:
        est.atualiza(); print(est.json().decode()); return
    if not a.sem_gravacao and OBS.config():
        nomes = {}
        try:
            with open(os.path.join(REPO, "data", "fm-data.json"), encoding="utf-8") as f:
                nomes = {d["id"]: d["n"] for d in json.load(f).get("duelists", [])}
        except (OSError, ValueError, KeyError):
            pass
        est.grav = Gravador(nomes)
        print("Gravação automática: um vídeo por duelo (OBS).")
    threading.Thread(target=est.ciclo, daemon=True).start()
    try:
        srv = servidor(est, a.porta)
    except OSError:
        sys.exit("A porta %d já está em uso (o programa já está aberto?). Use --porta 8766." % a.porta)
    print("FMDrops live: pronto.")
    print("  Painel (OBS / LIVE Studio):  http://127.0.0.1:%d/live.html?jogo=1" % a.porta)
    print("  Dados:                       http://127.0.0.1:%d/estado" % a.porta)
    print("Deixe esta janela aberta durante a live. Ctrl+C para sair.", flush=True)
    time.sleep(1.2)
    print("Fonte atual:", json.loads(est.json()).get("fonte") or json.loads(est.json()).get("msg"), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
