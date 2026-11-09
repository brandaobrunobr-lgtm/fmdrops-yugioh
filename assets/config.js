/*
 * CONFIGURAÇÃO DO SITE — edite este arquivo antes de publicar.
 *
 * Doação via Pix: preencha "key" com a SUA chave Pix (e-mail, telefone +55..., CPF/CNPJ ou chave aleatória),
 * "name" com o nome do recebedor (até 25 letras, sem acento) e "city" com a cidade (até 15 letras).
 * O site gera o QR Code e o "Pix copia e cola" com o valor que o visitante escolher.
 * Se "key" ficar vazio, a opção Pix não aparece.
 *
 * Outros links de doação (Ko-fi, PayPal, Livepix, GitHub Sponsors, Apoia.se...): adicione em "links".
 * Links com url vazia são ignorados.
 */
window.SITE_CONFIG = {
  siteName: "FM Drops",
  repoUrl: "https://github.com/brandaobrunobr-lgtm/forbidden-memories-drops",
  pix: {
    key: "",              // sua chave Pix
    name: "",             // nome do recebedor (sem acento)
    city: "",             // cidade (sem acento)
    message: "Apoio FM Drops"
  },
  links: [
    { label: "Ko-fi", url: "" },
    { label: "PayPal", url: "" },
    { label: "Livepix", url: "" },
    { label: "GitHub Sponsors", url: "" }
  ],
  presets: [5, 10, 20, 50, 100]
};
