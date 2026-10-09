# Oferta Fácil — versão com consulta automática (MVP)

## O que faz
- Recebe um link normal ou encurtado do Mercado Livre.
- O backend tenta resolver o redirecionamento e extrair o ID do anúncio.
- Consulta a API pública do Mercado Livre quando consegue identificar um item.
- Mostra nome, preço atual, preço original quando disponível e foto.
- Gera texto promocional para revisar e copiar para o WhatsApp.

## Limitações importantes
- Não há garantia de que todos os links encurtados funcionem. O Mercado Livre pode mudar os redirecionamentos, limitar consultas, ou exigir autenticação para determinados dados.
- Preço original pode vir ausente. O app não inventa desconto: só escreve “De/Por” se o preço original confirmado for maior que o atual.
- O botão copia o texto para compartilhar manualmente no WhatsApp comum. O app não automatiza envio em grupos.
- O endpoint usa apenas dados públicos e não solicita senha nem token de conta.

## Testar localmente
Requer Node.js 20+.
1. Extraia o ZIP.
2. No terminal, entre na pasta do projeto.
3. Execute `npx vercel dev`.
4. Abra o endereço local mostrado pelo Vercel CLI.
A instalação/execução local pode pedir login gratuito da Vercel.

## Publicar gratuitamente
1. Crie uma conta em https://vercel.com/.
2. Instale Git (opcional) e envie esta pasta para um repositório GitHub, ou importe o projeto pela Vercel.
3. Na Vercel, selecione o projeto e publique. Não são necessárias variáveis de ambiente nesta versão.
4. Abra a URL publicada e teste um link direto e um link meli.la.
Os planos e limites gratuitos podem mudar.

## Estrutura
- `index.html`: interface e gerador do texto.
- `api/product.js`: função serverless que resolve o link e consulta os dados.
- `vercel.json`: configuração de rotas e função.
