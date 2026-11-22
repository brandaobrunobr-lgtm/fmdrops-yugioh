"""Cria no OBS Studio o perfil e a cena "FMDrops" para gravar o jogo com o painel.

Cena "Gravação" (1920 × 1080):
  - Jogo: captura da janela do YFM Re-Decomp, recortada para só a imagem do jogo (4:3),
    à esquerda em 1440 × 1080;
  - Painel de cartas (live.html?jogo=1) e Último drop (live.html?jogo=1&v=drop),
    na coluna da direita (480 px);
  - Som do jogo: só o áudio do memories-pc.exe (nada de outros programas).
Grava em MP4 na pasta Vídeos.

Uso: python configurar-obs.py [--recorte E,D,C,B] [--forcar]
Depois: abra o OBS pelo atalho gravar-jogo.bat (ou escolha o perfil e a cena FMDrops).
"""
import argparse
import configparser
import json
import os
import sys
import uuid

NOME = "FMDrops"
JANELA = "Yu-Gi-Oh! Forbidden Memories:SDL_app:memories-pc.exe"
BASE = "http://127.0.0.1:8765/live.html?jogo=1"


def ini(caminho, secoes):
    cp = configparser.ConfigParser(interpolation=None)
    cp.optionxform = str
    if os.path.exists(caminho):
        cp.read(caminho, encoding="utf-8-sig")
    for s, kv in secoes.items():
        if not cp.has_section(s):
            cp.add_section(s)
        for k, v in kv.items():
            cp.set(s, k, str(v))
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        cp.write(f, space_around_delimiters=False)


def fonte(tipo, nome, settings):
    return {"id": tipo, "versioned_id": tipo, "name": nome, "uuid": str(uuid.uuid4()), "settings": settings,
            "enabled": True, "muted": False, "volume": 1.0, "mixers": 255, "monitoring_type": 0,
            "flags": 0, "sync": 0, "balance": 0.5, "deinterlace_mode": 0, "deinterlace_field_order": 0,
            "push-to-mute": False, "push-to-talk": False, "hotkeys": {}, "filters": [], "private_settings": {}}


def item(src, n, x, y, sx, sy, crop=(0, 0, 0, 0)):
    return {"name": src["name"], "source_uuid": src["uuid"], "visible": True, "locked": False,
            "rot": 0.0, "pos": {"x": x, "y": y}, "scale": {"x": sx, "y": sy}, "align": 5,
            "bounds_type": 0, "bounds_align": 0, "bounds": {"x": 0.0, "y": 0.0},
            "crop_left": crop[0], "crop_right": crop[1], "crop_top": crop[2], "crop_bottom": crop[3],
            "id": n, "group_item_backup": False, "scale_filter": "disable", "blend_method": "default",
            "blend_type": "normal", "show_transition": {"duration": 0}, "hide_transition": {"duration": 0},
            "private_settings": {}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--recorte", default="320,320,34,7",
                    help="pixels a cortar da janela do jogo: esquerda,direita,cima,baixo")
    ap.add_argument("--forcar", action="store_true", help="refaz a cena mesmo se já existir")
    a = ap.parse_args()
    crop = tuple(int(v) for v in a.recorte.split(","))
    obs = os.path.join(os.environ["APPDATA"], "obs-studio")
    cena_arq = os.path.join(obs, "basic", "scenes", NOME + ".json")
    if os.path.exists(cena_arq) and not a.forcar:
        sys.exit("A cena %s já existe em %s. Use --forcar para refazer." % (NOME, cena_arq))

    videos = os.path.join(os.path.expanduser("~"), "Videos")
    # perfil: 1920x1080, 30 fps, MP4 (híbrido: não corrompe se o PC desligar), Intel Quick Sync
    ini(os.path.join(obs, "basic", "profiles", NOME, "basic.ini"), {
        "General": {"Name": NOME},
        "Video": {"BaseCX": 1920, "BaseCY": 1080, "OutputCX": 1920, "OutputCY": 1080,
                  "FPSType": 0, "FPSCommon": "30", "ScaleType": "bicubic"},
        "Output": {"Mode": "Simple"},
        "SimpleOutput": {"FilePath": videos, "RecFormat2": "hybrid_mp4", "RecQuality": "Small",
                         "RecEncoder": "qsv", "StreamEncoder": "qsv", "VBitrate": 6000,
                         "ABitrate": 160, "FileNameWithoutSpace": "true"},
        "Audio": {"SampleRate": 48000, "ChannelSetup": "Stereo"},
    })
    pref = {"Profile": NOME, "ProfileDir": NOME, "SceneCollection": NOME, "SceneCollectionFile": NOME}
    for arq in ("user.ini", "global.ini"):   # OBS 31+ usa user.ini; versões antigas, global.ini
        ini(os.path.join(obs, arq), {"General": {"FirstRun": "true", "ConfirmOnExit": "false",
                                                 "WarnBeforeStoppingRecord": "false"}, "Basic": pref})

    jogo = fonte("window_capture", "Jogo", {"window": JANELA, "method": 2, "client_area": True,
                                             "cursor": False, "priority": 2})
    som = fonte("wasapi_process_output_capture", "Som do jogo", {"window": JANELA, "priority": 2})
    css = "body{background-color:rgba(0,0,0,0);margin:0;overflow:hidden}"
    painel = fonte("browser_source", "Painel de cartas", {"url": BASE + "&bg=transp", "width": 1080,
                                                          "height": 700, "fps": 30, "css": css,
                                                          "restart_when_active": False, "shutdown": False})
    drop = fonte("browser_source", "Último drop", {"url": BASE + "&v=drop&bg=transp", "width": 640,
                                                    "height": 360, "fps": 30, "css": css})
    fundo = fonte("browser_source", "Plano de fundo", {"url": "http://127.0.0.1:8765/live.html?v=fundo",
                                                         "width": 1920, "height": 1080, "fps": 30, "css": css})
    avatar = fonte("browser_source", "Avatar", {"url": BASE + "&v=avatar", "width": 480, "height": 340,
                                                "fps": 30, "css": css})
    gw = 1920 - 480                                 # largura do jogo na tela (4:3 em 1080 de altura)
    s = gw / max(1, 1920 - crop[0] - crop[1])        # janela de 1920 px de largura, já recortada
    # a primeira da lista fica embaixo de todas
    itens = [item(fundo, 1, 0, 0, 1, 1), item(jogo, 2, 0, 0, s, s, crop), item(som, 3, 0, 0, 1, 1),
             item(painel, 4, gw, 0, 480 / 1080, 480 / 1080), item(drop, 5, gw, 320, 0.75, 0.75),
             item(avatar, 6, gw, 595, 1, 1)]
    cena = fonte("scene", "Gravação", {"id_counter": len(itens), "custom_size": False, "items": itens})
    colecao = {"name": NOME, "current_scene": "Gravação", "current_program_scene": "Gravação",
               "scene_order": [{"name": "Gravação"}], "sources": [cena, fundo, jogo, som, painel, drop, avatar],
               "groups": [], "quick_transitions": [], "transitions": [], "saved_projectors": [],
               "current_transition": "Fade", "transition_duration": 300, "preview_locked": False,
               "scaling_enabled": False, "scaling_level": 0, "scaling_off_x": 0.0, "scaling_off_y": 0.0,
               "modules": {}, "version": 2}
    os.makedirs(os.path.dirname(cena_arq), exist_ok=True)
    with open(cena_arq, "w", encoding="utf-8") as f:
        json.dump(colecao, f, ensure_ascii=False, indent=2)

    # controle remoto (obs-websocket) para o fmlive.py começar/parar um vídeo por duelo.
    # Senha aleatória, guardada só aqui; o fmlive.py lê deste mesmo arquivo.
    ws = os.path.join(obs, "plugin_config", "obs-websocket", "config.json")
    atual = {}
    try:
        with open(ws, encoding="utf-8") as f:
            atual = json.load(f)
    except (OSError, ValueError):
        pass
    import secrets
    atual.update({"server_enabled": True, "auth_required": True, "alerts_enabled": False,
                  "first_load": False, "server_port": atual.get("server_port", 4455),
                  "server_password": atual.get("server_password") or secrets.token_urlsafe(24)})
    os.makedirs(os.path.dirname(ws), exist_ok=True)
    with open(ws, "w", encoding="utf-8") as f:
        json.dump(atual, f, indent=2)
    print("Controle remoto do OBS ligado (porta %s, com senha)." % atual["server_port"])
    print("OBS configurado: perfil e cena", NOME, "->", cena_arq)
    print("Vídeos em:", videos)


if __name__ == "__main__":
    main()
