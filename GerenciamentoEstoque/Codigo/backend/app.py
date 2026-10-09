import json
from io import BytesIO
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter
from flask import Flask, send_file, jsonify, request
from flask_cors import CORS
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

app = Flask(__name__)
CORS(app)
PALETA = ["#38bdf8", "#f97316", "#a78bfa", "#34d399", "#f472b6", "#facc15"]

CORES_STATUS = {
    "Disponível": "#22c55e",
    "Estoque baixo": "#eab308",
    "Esgotado": "#ef4444"
}

LIMITE_ESTOQUE_BAIXO = 10
LIMITE_PRODUTOS_NO_GRAFICO = 15

#====Caminho JSON====
ARQUIVO_ESTOQUE = Path(__file__).parent / 'data/estoque.json'

def conseguirDados(dados):
    estoquePorCategoria = {}

    for produto in dados:
        categoria = produto["categoria"]
        quantidade = produto["quantidade"]

        estoquePorCategoria[categoria] = (
            estoquePorCategoria.get(categoria, 0) + quantidade
        )

    categorias = list(estoquePorCategoria.keys())
    valores = list(estoquePorCategoria.values())

    return categorias, valores

def carregarEstoque():
    with open(ARQUIVO_ESTOQUE, 'r', encoding='utf-8') as arquivo:
        return json.load(arquivo)

def obterStatus(quantidade):
    if quantidade == 0:
        return "Esgotado"
    if quantidade <= LIMITE_ESTOQUE_BAIXO:
        return "Estoque baixo"
    return "Disponível"

def somarPorCategoria(produtos, calcular):
    totais = {}

    for produto in produtos:
        categoria = produto['categoria']
        totais[categoria] = totais.get(categoria, 0) + calcular(produto)

    return list(totais.keys()), list(totais.values())

def formatarReal(valor):
    texto = f'{valor:,.2f}'
    return 'R$ '+ texto.replace(',', 'x'). replace('.', ',').replace('x', '.')

def criarFigura(titulo, largura=7, altura=5):
    figura, eixo = plt.subplots(figsize=(largura, altura))

    figura.patch.set_facecolor('#151b23')
    eixo.set_facecolor('#151b23')

    eixo.set_title(titulo, color='#f8fafc', fontsize=14, fontweight='bold', pad=20)

    return figura, eixo

def estilizarEixos(eixo, direcaoGrade):
    eixo.tick_params(colors="#f8fafc")
    eixo.set_axisbelow(True)

    # Configura a grade do gráfico
    eixo.grid(
        visible=True,
        axis=direcaoGrade,
        color="#2d3748",
        linewidth=0.8
    )

    # Remove as bordas superior e direita
    for lado in ("top", "right"):
        eixo.spines[lado].set_visible(False)

    # Configura as bordas inferior e esquerda
    for lado in ("left", "bottom"):
        eixo.spines[lado].set_color("#2d3748")

def desenharPizza(eixo, rotulos, valores, cores, rosca=False):
    propriedades = {"edgecolor": '#151b23', "linewidth": 2}
 
    if rosca:
        propriedades["width"] = 0.45
 
    _, _, porcentagens = eixo.pie(
        valores,
        labels=rotulos,
        colors=cores,
        autopct="%1.1f%%",
        startangle=90,
        pctdistance=0.78 if rosca else 0.6,
        textprops={"color": '#f8fafc', "fontsize": 11},
        wedgeprops=propriedades
    )
 
    for porcentagem in porcentagens:
        porcentagem.set_color('#0b0f14')
        porcentagem.set_fontweight("bold")
 
    eixo.axis("equal")
 
 
def figuraParaResposta(figura):
    imagem = BytesIO()
 
    figura.savefig(
        imagem,
        format="png",
        bbox_inches="tight",
        facecolor=figura.get_facecolor()
    )
 
    plt.close(figura)
    imagem.seek(0)
 
    return send_file(imagem, mimetype="image/png")
 
#==== Gráficos (cada um devolve a figura, ou None se não há dados) ====
def graficoCategorias(produtos):
    categorias, unidades = somarPorCategoria(produtos, lambda p: p["quantidade"])
 
    # Categorias sem unidades ficariam como fatias de 0% sobrepostas
    dados = [(c, u) for c, u in zip(categorias, unidades) if u > 0]
 
    if not dados:
        return None
 
    rotulos, valores = zip(*dados)
    cores = [PALETA[i % len(PALETA)] for i in range(len(rotulos))]
 
    figura, eixo = criarFigura("Quantidade de produtos por categoria")
    desenharPizza(eixo, rotulos, valores, cores)
 
    return figura
 
 
def graficoStatus(produtos):
    if not produtos:
        return None
 
    contagem = {}
 
    for produto in produtos:
        status = obterStatus(produto["quantidade"])
        contagem[status] = contagem.get(status, 0) + 1
 
    rotulos = [s for s in CORES_STATUS if contagem.get(s)]
    valores = [contagem[s] for s in rotulos]
    cores = [CORES_STATUS[s] for s in rotulos]
 
    figura, eixo = criarFigura("Produtos por situação")
    desenharPizza(eixo, rotulos, valores, cores, rosca=True)
 
    return figura
 
 
def graficoProdutos(produtos):
    if not produtos:
        return None
 
    ordenados = sorted(produtos, key=lambda p: p["quantidade"])
    mostrados = ordenados[-LIMITE_PRODUTOS_NO_GRAFICO:]
 
    nomes = [p["nome"] for p in mostrados]
    quantidades = [p["quantidade"] for p in mostrados]
    cores = [CORES_STATUS[obterStatus(q)] for q in quantidades]
 
    titulo = "Unidades por produto"
 
    if len(ordenados) > len(mostrados):
        titulo += f" ({len(mostrados)} maiores)"
 
    altura = max(3.5, 0.5 * len(nomes) + 1.5)
    figura, eixo = criarFigura(titulo, 7, altura)
 
    barras = eixo.barh(nomes, quantidades, color=cores)
    eixo.bar_label(barras, padding=4, color='#151b23')
    eixo.margins(x=0.12)
 
    estilizarEixos(eixo, "x")
    eixo.set_xlabel("Unidades", color='#f8fafc')
 
    eixo.legend(
        handles=[Patch(color=cor, label=status) for status, cor in CORES_STATUS.items()],
        loc="lower right",
        frameon=False,
        labelcolor='#f8fafc'
    )
 
    return figura
 
 
def graficoValor(produtos):
    if not produtos:
        return None
 
    categorias, valores = somarPorCategoria(
        produtos,
        lambda p: p["quantidade"] * p["preco"]
    )
 
    figura, eixo = criarFigura("Valor em estoque por categoria")
 
    barras = eixo.bar(categorias, valores, color='#38bdf8')
    eixo.bar_label(
        barras,
        labels=[formatarReal(v) for v in valores],
        padding=4,
        color='#f8fafc'
    )
    eixo.margins(y=0.15)
 
    estilizarEixos(eixo, "y")
    eixo.yaxis.set_major_formatter(FuncFormatter(lambda v, _: formatarReal(v)))
 
    return figura
 
 
GRAFICOS = {
    "categorias": graficoCategorias,
    "status": graficoStatus,
    "produtos": graficoProdutos,
    "valor": graficoValor
}

# ==== API que gera o gráfico ====
@app.get("/api/produtos")
def listarProdutos():
    dados = carregarEstoque()
    return jsonify(dados["produtos"])
 
 
@app.post("/api/produtos")
def salvarProdutos():
    novosProdutos = request.get_json()
 
    if not isinstance(novosProdutos, list):
        return jsonify({"erro": "Formato de produtos inválido"}), 400
 
    with open(ARQUIVO_ESTOQUE, "w", encoding="utf-8") as arquivo:
        json.dump(
            {"produtos": novosProdutos},
            arquivo,
            ensure_ascii=False,
            indent=4
        )
 
    return jsonify({
        "mensagem": "Estoque salvo com sucesso!",
        "produtos": novosProdutos
    })
 
#==== API que gera os gráficos ====
@app.get("/api/grafico/<tipo>")
def gerarGrafico(tipo):
    construir = GRAFICOS.get(tipo)
 
    if construir is None:
        return jsonify({"erro": "Gráfico não encontrado."}), 404
 
    produtos = carregarEstoque()["produtos"]
    figura = construir(produtos)
 
    if figura is None:
        return jsonify({
            "erro": "Não existem unidades em estoque para gerar o gráfico."
        }), 400
 
    return figuraParaResposta(figura)
 
 
# Rota antiga, mantida por compatibilidade
@app.get("/api/grafico")
def gerarGraficoPadrao():
    return gerarGrafico("categorias")



#====== Planilha ======

def gerarPlanilhaEstoque(produtos):
    arquivoExcel = Workbook()
    planilha = arquivoExcel.active
    planilha.title = "Relatório de Estoque"

    #==== Cores ====

    azulEscuro = "0B0F14"
    azulMedio = "151B23"
    branco = "FFFFFF"
    cinza = "D1D5DB"

    preenchimentoTitulo = PatternFill("solid", fgColor=azulEscuro)
    preenchimentoCabecalho = PatternFill("solid", fgColor=azulMedio)
    preenchimentoCategoria = PatternFill("solid", fgColor="263445")
    preenchimentoTotal = PatternFill("solid", fgColor="DCEAF7")

    bordaFina = Border(
        bottom=Side(style="thin", color="D1D5DB")
    )

    #==== Título ====

    planilha.merge_cells("A1:F1")
    planilha["A1"] = "STOCKFLOW | RELATÓRIO DE ESTOQUE"
    planilha["A1"].font = Font(
        name="Arial", size=16, bold=True, color=branco
    )
    planilha["A1"].fill = preenchimentoTitulo
    planilha["A1"].alignment = Alignment(
        horizontal="center", vertical="center"
    )
    planilha.row_dimensions[1].height = 35

    planilha.merge_cells("A2:F2")
    planilha["A2"] = (
        "Data de emissão: "
        + datetime.now().strftime("%d/%m/%Y %H:%M")
    )
    planilha["A2"].font = Font(
        name="Arial", size=10, italic=True, color=cinza
    )
    planilha["A2"].fill = preenchimentoTitulo
    planilha["A2"].alignment = Alignment(horizontal="right")
    planilha.row_dimensions[2].height = 24

    #==== Resumo geral ====

    totalProdutos = len(produtos)
    totalUnidades = sum(p["quantidade"] for p in produtos)
    valorTotal = sum(
        p["quantidade"] * p["preco"] for p in produtos
    )

    planilha.merge_cells("A4:F4")
    planilha["A4"] = "RESUMO GERAL"
    planilha["A4"].font = Font(bold=True, color=branco, size=12)
    planilha["A4"].fill = preenchimentoCabecalho

    planilha["A5"] = "Produtos cadastrados"
    planilha["B5"] = totalProdutos
    planilha["C5"] = "Unidades em estoque"
    planilha["D5"] = totalUnidades
    planilha["E5"] = "Valor estimado"
    planilha["F5"] = valorTotal
    planilha["F5"].number_format = '"R$" #,##0.00'

    for celula in planilha[5]:
        celula.font = Font(bold=True, color=azulEscuro)
        celula.alignment = Alignment(horizontal="center")
        celula.border = bordaFina

    #==== Cabeçalho da tabela ====

    linha = 7

    colunas = [
        "Código",
        "Produto",
        "Categoria",
        "Quantidade",
        "Preço unitário",
        "Valor total"
    ]

    for coluna, titulo in enumerate(colunas, start=1):
        celula = planilha.cell(
            row=linha, column=coluna, value=titulo
        )
        celula.font = Font(bold=True, color=branco)
        celula.fill = preenchimentoCabecalho
        celula.alignment = Alignment(
            horizontal="center", vertical="center"
        )

    linha += 1
    linhasSubtotal = []

    #==== Organizar produtos por categoria ====

    categorias = sorted(
        {p["categoria"] for p in produtos},
        key=str.casefold
    )

    for categoria in categorias:
        produtosCategoria = sorted(
            [
                p for p in produtos
                if p["categoria"] == categoria
            ],
            key=lambda p: p["nome"].casefold()
        )

        
        # Título da categoria
        planilha.merge_cells(
            start_row=linha,
            start_column=1,
            end_row=linha,
            end_column=6
        )

        celulaCategoria = planilha.cell(
            row=linha,
            column=1,
            value=categoria.upper()
        )

        celulaCategoria.font = Font(bold=True, color=branco)

        for coluna in range(1, 7):
            planilha.cell(
                row=linha,
                column=coluna
            ).fill = preenchimentoCategoria

        linha += 1
        primeiraLinhaProdutos = linha

        # Produtos da categoria
        for produto in produtosCategoria:
            valores = [
                produto["codigo"],
                produto["nome"],
                produto["categoria"],
                produto["quantidade"],
                produto["preco"],
                f"=D{linha}*E{linha}"
            ]

            for coluna, valor in enumerate(valores, start=1):
                celula = planilha.cell(
                    row=linha, column=coluna, value=valor
                )
                celula.border = bordaFina

            planilha.cell(
                linha, 5
            ).number_format = '"R$" #,##0.00'

            planilha.cell(
                linha, 6
            ).number_format = '"R$" #,##0.00'

            linha += 1

        ultimaLinhaProdutos = linha - 1

        # Subtotal da categoria
        planilha.cell(
            row=linha,
            column=3,
            value=f"Subtotal - {categoria}"
        )

        planilha.cell(
            row=linha,
            column=4,
            value=f"=SUM(D{primeiraLinhaProdutos}:D{ultimaLinhaProdutos})"
        )

        planilha.cell(
            row=linha,
            column=6,
            value=f"=SUM(F{primeiraLinhaProdutos}:F{ultimaLinhaProdutos})"
        )

        for celula in planilha[linha]:
            celula.fill = preenchimentoTotal
            celula.font = Font(bold=True, color=azulEscuro)

        planilha.cell(
            linha, 6
        ).number_format = '"R$" #,##0.00'

        linhasSubtotal.append(linha)
        linha += 2

    #==== Total geral ====

    planilha.cell(linha, 3, "TOTAL GERAL")

    if linhasSubtotal:
        celulasQuantidade = ",".join(
            f"D{linhaSubtotal}" for linhaSubtotal in linhasSubtotal
        )
        celulasValor = ",".join(
            f"F{linhaSubtotal}" for linhaSubtotal in linhasSubtotal
        )

        planilha.cell(
            linha, 4, f"=SUM({celulasQuantidade})"
        )
        planilha.cell(
            linha, 6, f"=SUM({celulasValor})"
        )
    else:
        planilha.cell(linha, 4, 0)
        planilha.cell(linha, 6, 0)

    for celula in planilha[linha]:
        celula.fill = preenchimentoTitulo
        celula.font = Font(bold=True, color=branco)

    planilha.cell(
        linha, 6
    ).number_format = '"R$" #,##0.00'

    #==== Formatação final ====

    larguras = {
        "A": 14,
        "B": 30,
        "C": 24,
        "D": 16,
        "E": 20,
        "F": 20
    }

    for coluna, largura in larguras.items():
        planilha.column_dimensions[coluna].width = largura

    planilha.freeze_panes = "A8"
    planilha.sheet_view.showGridLines = False
    planilha.sheet_properties.pageSetUpPr.fitToPage = True
    planilha.page_setup.fitToWidth = 1
    planilha.page_setup.fitToHeight = 0
    planilha.page_setup.orientation = "landscape"
    planilha.print_title_rows = "1:7"

    #==== Preparar arquivo para download ====

    arquivoMemoria = BytesIO()
    arquivoExcel.save(arquivoMemoria)
    arquivoMemoria.seek(0)

    return arquivoMemoria


#==== API PLANILHA ====

@app.get("/api/planilha")
def baixarPlanilha():
    produtos = carregarEstoque()["produtos"]
    arquivo = gerarPlanilhaEstoque(produtos)

    nomeArquivo = (
        f"Relatorio_Estoque_{datetime.now().strftime('%Y%m%d')}.xlsx"
    )

    return send_file(
        arquivo,
        as_attachment=True,
        download_name=nomeArquivo,
        mimetype=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        )
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)