/* aplica o tema salvo antes de desenhar a página (arquivo separado por causa da CSP) */
try { var t = localStorage.getItem("fmd:theme"); if (t) document.documentElement.setAttribute("data-theme", JSON.parse(t)); } catch (e) { /* */ }
