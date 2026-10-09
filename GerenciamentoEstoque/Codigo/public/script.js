"use strict";

//==== Configuração e estado ====

const API_URL = "https://stockflow-api-vrs2.onrender.com/api";
const LIMITE_ESTOQUE_BAIXO = 10;

let usuario = localStorage.getItem("stockflow_usuario") || "Ítalo";
let produtos = [];

//==== Elementos HTML ====

const modalProduto = document.getElementById("modalProduto");
const formularioProduto = document.getElementById("formularioProduto");
const tituloFormulario = document.getElementById("tituloFormulario");
const campoCodigo = document.getElementById("produtoCodigo");
const campoNome = document.getElementById("produtoNome");
const campoCategoria = document.getElementById("produtoCategoria");
const campoQuantidade = document.getElementById("produtoQuantidade");
const campoPreco = document.getElementById("produtoPreco");
const mensagemFormulario = document.getElementById("mensagemFormulario");
const btnSalvarProduto = document.getElementById("btnSalvarProduto");
const btnCancelarFormulario = document.getElementById("btnCancelarFormulario");
const btnFecharFormulario = document.getElementById("btnFecharFormulario");

let codigoProdutoEditando = null;

//==== Comunicação com o Python ====

async function carregarProdutos() {
    try {
        const resposta = await fetch(`${API_URL}/produtos`);

        if (!resposta.ok) {
            throw new Error(`Erro ${resposta.status} ao buscar produtos.`);
        }

        const dados = await resposta.json();

        // Aceita tanto [ ... ] quanto { "produtos": [ ... ] }
        produtos = Array.isArray(dados) ? dados : (dados.produtos ?? []);

        renderizarProdutos(pesquisaProduto.value);
    } catch (erro) {
        console.error("Erro ao carregar estoque:", erro);
        alert("Não foi possível carregar o estoque. Verifique se o servidor Python está ativo.");
    }
}

/**
 * Envia a nova lista ao Python. Só atualiza o estado local
 * se o servidor confirmar o salvamento, assim a tela nunca
 * fica diferente do JSON.
 */
async function salvarProdutos(novaLista) {
    try {
        const resposta = await fetch(`${API_URL}/produtos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(novaLista)
        });

        if (!resposta.ok) {
            throw new Error(`Erro ${resposta.status} ao salvar produtos.`);
        }

        produtos = novaLista;
        renderizarProdutos(pesquisaProduto.value);
        return true;
    } catch (erro) {
        console.error("Erro ao salvar estoque:", erro);
        alert("Não foi possível salvar as alterações no estoque.");
        return false;
    }
}

const GRAFICOS = [
    { tipo: "categorias", titulo: "Unidades por categoria" },
    { tipo: "status", titulo: "Produtos por situação" },
    { tipo: "produtos", titulo: "Unidades por produto" },
    { tipo: "valor", titulo: "Valor em estoque por categoria" }
];

//==== Criar os cartões dos gráficos ====

function criarCartaoGrafico({ tipo, titulo }) {
    const cartao = document.createElement("figure");
    cartao.className = "cartao_grafico";

    const tituloGrafico = document.createElement("figcaption");
    tituloGrafico.textContent = titulo;

    const imagem = document.createElement("img");
    imagem.alt = titulo;
    imagem.hidden = true;

    const mensagem = document.createElement("p");
    mensagem.className = "mensagem_grafico";
    mensagem.textContent = "Aguardando carregamento...";

    cartao.append(tituloGrafico, imagem, mensagem);

    return { tipo, cartao, imagem, mensagem };
}

const cartoesGraficos = GRAFICOS.map(criarCartaoGrafico);

areaGraficos.replaceChildren(
    ...cartoesGraficos.map(grafico => grafico.cartao)
);

//==== Carregar um gráfico do Python ====

async function carregarGrafico({ tipo, imagem, mensagem }) {
    mensagem.textContent = "Carregando gráfico...";

    try {
        const resposta = await fetch(
            `${API_URL}/grafico/${tipo}`,
            { cache: "no-store" }
        );

        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => ({}));

            throw new Error(
                erro.erro || `Erro ${resposta.status} ao carregar gráfico.`
            );
        }

        const imagemBlob = await resposta.blob();
        const novaUrl = URL.createObjectURL(imagemBlob);

        if (imagem.dataset.urlAnterior) {
            URL.revokeObjectURL(imagem.dataset.urlAnterior);
        }

        imagem.src = novaUrl;
        imagem.dataset.urlAnterior = novaUrl;
        imagem.hidden = false;

        mensagem.textContent = "";

    } catch (erro) {
        console.error(`Erro no gráfico ${tipo}:`, erro);

        imagem.hidden = true;
        mensagem.textContent = erro.message ||
            "Não foi possível carregar o gráfico.";
    }
}

//==== Carregar todos os gráficos ====

function carregarGraficos() {
    return Promise.all(
        cartoesGraficos.map(grafico => carregarGrafico(grafico))
    );
}

//==== Usuário ====

function atualizarUsuario() {
    nomeUsuario.textContent = usuario;
}

nomeUsuario.addEventListener("click", () => {
    const novoNome = prompt("Digite o nome do usuário:", usuario);

    if (novoNome !== null && novoNome.trim() !== "") {
        usuario = novoNome.trim();
        localStorage.setItem("stockflow_usuario", usuario);
        atualizarUsuario();
    }
});

//==== Funções auxiliares ====

function obterStatus(quantidade) {
    if (quantidade === 0) {
        return { texto: "Esgotado", classe: "esgotado" };
    }

    if (quantidade <= LIMITE_ESTOQUE_BAIXO) {
        return { texto: "Estoque baixo", classe: "baixo" };
    }

    return { texto: "Disponível", classe: "disponivel" };
}

function formatarPreco(preco) {
    return preco.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

/** Pede um texto ao usuário. Retorna null se cancelar ou deixar vazio. */
function perguntar(mensagem, valorPadrao = "") {
    const resposta = prompt(mensagem, valorPadrao);

    if (resposta === null || resposta.trim() === "") {
        return null;
    }

    return resposta.trim();
}

/** Valida e converte uma quantidade. Retorna null (com alerta) se inválida. */
function lerQuantidade(texto) {
    const quantidade = Number(texto);

    if (!Number.isInteger(quantidade) || quantidade < 0) {
        alert("Digite uma quantidade inteira igual ou maior que zero.");
        return null;
    }

    return quantidade;
}


function gerarProximoCodigo() {
    const maiorCodigo = produtos.reduce(
        (maior, produto) =>
            Math.max(maior, Number(produto.codigo) || 0),
        0
    );

    return String(maiorCodigo + 1).padStart(3, "0");
}

function abrirFormularioProduto(produto = null) {
    formularioProduto.reset();
    mensagemFormulario.textContent = "";
    mensagemFormulario.classList.remove("sucesso");

    codigoProdutoEditando = produto ? produto.codigo : null;

    if (produto) {
        tituloFormulario.textContent = "Editar produto";
        campoCodigo.value = produto.codigo;
        campoNome.value = produto.nome;
        campoCategoria.value = produto.categoria;
        campoQuantidade.value = produto.quantidade;
        campoPreco.value = produto.preco;
        btnSalvarProduto.innerHTML = "<span aria-hidden=\"true\">✓</span> Salvar alterações";
    } else {
        tituloFormulario.textContent = "Adicionar produto";
        campoCodigo.value = gerarProximoCodigo();
        btnSalvarProduto.innerHTML = "<span aria-hidden=\"true\">✓</span> Salvar produto";
    }

    modalProduto.hidden = false;
    document.body.style.overflow = "hidden";

    campoNome.focus();
}

function fecharFormularioProduto() {
    modalProduto.hidden = true;
    document.body.style.overflow = "";
    formularioProduto.reset();
    mensagemFormulario.textContent = "";
    mensagemFormulario.classList.remove("sucesso");
    codigoProdutoEditando = null;
}

btnAdicionar.addEventListener("click", () => {
    abrirFormularioProduto();
});

btnCancelarFormulario.addEventListener("click", fecharFormularioProduto);
btnFecharFormulario.addEventListener("click", fecharFormularioProduto);

// Fecha ao clicar na área escura fora do formulário.
modalProduto.addEventListener("click", evento => {
    if (evento.target === modalProduto) {
        fecharFormularioProduto();
    }
});

// Fecha ao pressionar Escape.
document.addEventListener("keydown", evento => {
    if (evento.key === "Escape" && !modalProduto.hidden) {
        fecharFormularioProduto();
    }
});


formularioProduto.addEventListener("submit", async evento => {
    evento.preventDefault();

    const nome = campoNome.value.trim();
    const categoria = campoCategoria.value.trim();
    const quantidadeTexto = campoQuantidade.value.trim();
    const precoTexto = campoPreco.value.trim();

    const quantidade = Number(quantidadeTexto);
    const preco = Number(precoTexto);

    mensagemFormulario.classList.remove("sucesso");

    if (!nome || !categoria || !quantidadeTexto || !precoTexto) {
        mensagemFormulario.textContent =
            "Preencha todos os campos obrigatórios.";
        return;
    }

    if (!Number.isInteger(quantidade) || quantidade < 0) {
        mensagemFormulario.textContent =
            "A quantidade deve ser um número inteiro igual ou maior que zero.";
        campoQuantidade.focus();
        return;
    }

    if (!Number.isFinite(preco) || preco < 0) {
        mensagemFormulario.textContent =
            "Digite um preço válido, igual ou maior que zero.";
        campoPreco.focus();
        return;
    }

    let novaLista;

    if (codigoProdutoEditando !== null) {
        novaLista = produtos.map(produto =>
            produto.codigo === codigoProdutoEditando
                ? {
                    ...produto,
                    nome,
                    categoria,
                    quantidade,
                    preco
                }
                : produto
        );
    } else {
        const novoProduto = {
            codigo: gerarProximoCodigo(),
            nome,
            categoria,
            quantidade,
            preco
        };

        novaLista = [...produtos, novoProduto];
    }

    btnSalvarProduto.disabled = true;
    btnCancelarFormulario.disabled = true;
    btnFecharFormulario.disabled = true;
    mensagemFormulario.textContent = "Salvando produto...";

    try {
        const salvou = await salvarProdutos(novaLista);

        if (!salvou) {
            mensagemFormulario.textContent =
                "Não foi possível salvar. Confira o servidor e tente novamente.";
            return;
        }

        mensagemFormulario.classList.add("sucesso");
        mensagemFormulario.textContent =
            codigoProdutoEditando !== null
                ? "Produto atualizado com sucesso!"
                : "Produto cadastrado com sucesso!";

        // Mantém a mensagem visível brevemente antes de fechar.
        window.setTimeout(() => {
            fecharFormularioProduto();
        }, 500);

    } finally {
        btnSalvarProduto.disabled = false;
        btnCancelarFormulario.disabled = false;
        btnFecharFormulario.disabled = false;
    }
});

//==== Renderização da tabela ====

function criarCelula(conteudo) {
    const celula = document.createElement("td");
    celula.textContent = conteudo;
    return celula;
}

function criarBotao(texto, classe, aoClicar) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = texto;
    botao.className = classe;
    botao.addEventListener("click", aoClicar);
    return botao;
}

function criarLinhaProduto(produto) {
    const linha = document.createElement("tr");
    const status = obterStatus(produto.quantidade);

    linha.append(
        criarCelula(produto.codigo),
        criarCelula(produto.nome),
        criarCelula(produto.categoria),
        criarCelula(produto.quantidade),
        criarCelula(formatarPreco(produto.preco))
    );

    const etiqueta = document.createElement("span");
    etiqueta.className = `status ${status.classe}`;
    etiqueta.textContent = status.texto;

    const celulaStatus = document.createElement("td");
    celulaStatus.appendChild(etiqueta);

    
    const celulaAcoes = document.createElement("td");

    celulaAcoes.append(
        criarBotao("Editar", "btnAcao", () => {
            abrirFormularioProduto(produto);
        }),
        criarBotao("Excluir", "btnAcao btnExcluir", () => {
            excluirProduto(produto.codigo);
        })
    );


    linha.append(celulaStatus, celulaAcoes);
    return linha;
}

function criarLinhaVazia() {
    const linha = document.createElement("tr");
    const celula = criarCelula("Nenhum produto encontrado.");

    celula.colSpan = 7;
    celula.className = "mensagem_vazia";

    linha.appendChild(celula);
    return linha;
}

function renderizarProdutos(filtro = "") {
    const termo = filtro.trim().toLocaleLowerCase("pt-BR");

    const encontrados = produtos.filter(produto =>
        [produto.codigo, produto.nome, produto.categoria].some(valor =>
            String(valor).toLocaleLowerCase("pt-BR").includes(termo)
        )
    );

    listaProdutos.replaceChildren(
        ...(encontrados.length > 0
            ? encontrados.map(criarLinhaProduto)
            : [criarLinhaVazia()])
    );

    atualizarResumo();
}

function atualizarResumo() {
    const definirTexto = (id, valor) => {
        document.getElementById(id).textContent = valor;
    };

    definirTexto("totalProdutos", produtos.length);
    definirTexto("totalUnidades", produtos.reduce((soma, p) => soma + p.quantidade, 0));
    definirTexto(
        "totalBaixo",
        produtos.filter(p => p.quantidade > 0 && p.quantidade <= LIMITE_ESTOQUE_BAIXO).length
    );
    definirTexto("totalEsgotados", produtos.filter(p => p.quantidade === 0).length);
}

//==== Ações (cada uma salva no JSON via Python) ====

pesquisaProduto.addEventListener("input", () => {
    renderizarProdutos(pesquisaProduto.value);
});



async function alterarQuantidade(codigo) {
    const produto = produtos.find(p => p.codigo === codigo);
    if (!produto) return;

    const resposta = perguntar(`Nova quantidade para ${produto.nome}:`, produto.quantidade);
    if (resposta === null) return;

    const quantidade = lerQuantidade(resposta);
    if (quantidade === null) return;

    await salvarProdutos(
        produtos.map(p => p.codigo === codigo ? { ...p, quantidade } : p)
    );
}

async function excluirProduto(codigo) {
    const produto = produtos.find(p => p.codigo === codigo);
    if (!produto) return;

    if (!confirm(`Deseja excluir "${produto.nome}"?`)) return;

    await salvarProdutos(produtos.filter(p => p.codigo !== codigo));
}

//==== Navegação entre páginas ====

const linksNavegacao = document.querySelectorAll("#sectionbar [data-pagina]");

const paginas = {
    inicio: document.getElementById("pagina-inicio"),
    planilha: document.getElementById("pagina-planilha"),
    resumo: document.getElementById("pagina-resumo")
};

function navegarPara(nomePagina) {
    if (!paginas[nomePagina]) {
        nomePagina = "inicio";
    }

    Object.entries(paginas).forEach(([nome, pagina]) => {
        pagina.classList.toggle("ativa", nome === nomePagina);
    });

    linksNavegacao.forEach(link => {
        const ativo = link.dataset.pagina === nomePagina;

        link.classList.toggle("ativo", ativo);

        if (ativo) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    if (location.hash !== `#${nomePagina}`) {
        history.replaceState(null, "", `#${nomePagina}`);
    }

    if (nomePagina === "resumo") {
        carregarGraficos();
    }
}

linksNavegacao.forEach(link => {
    link.addEventListener("click", evento => {
        evento.preventDefault();
        navegarPara(link.dataset.pagina);
    });
});

 //==== Download da planilha Excel ====

btnBaixarPlanilha.addEventListener("click", async () => {
    btnBaixarPlanilha.disabled = true;
    mensagemPlanilha.textContent = "Gerando relatório Excel...";

    try {
        const resposta = await fetch(`${API_URL}/planilha`);

        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => ({}));
            throw new Error(
                erro.erro || "Não foi possível gerar a planilha."
            );
        }

        const arquivo = await resposta.blob();
        const url = URL.createObjectURL(arquivo);

        const link = document.createElement("a");
        link.href = url;
        link.download = `Relatorio_Estoque_${new Date()
            .toISOString()
            .slice(0, 10)
            .replaceAll("-", "")}.xlsx`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        mensagemPlanilha.textContent =
            "Relatório gerado e download solicitado com sucesso.";

    } catch (erro) {
        console.error("Erro ao baixar planilha:", erro);

        mensagemPlanilha.textContent =
            erro.message || "Erro ao gerar o relatório.";

    } finally {
        btnBaixarPlanilha.disabled = false;
    }
});

//==== Inicialização ====

atualizarUsuario();
carregarProdutos();
// Sempre iniciar em Início, ignorando a última página aberta.
navegarPara("inicio");
