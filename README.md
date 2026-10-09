# Oferta Fácil — primeira versão

## O que faz
- Busca produtos do Mercado Livre Brasil pela API de busca.
- Ordena pelo menor preço.
- Permite buscar por palavra-chave ou por algumas categorias.
- Mostra foto, título, preço e preço original quando fornecido.
- Gera uma mensagem e copia para você enviar manualmente pelo WhatsApp.

## Publicar pelo GitHub e Vercel
1. No repositório GitHub `PandoLouco/oferta-facil`, abra `index.html` e substitua todo o conteúdo pelo arquivo deste pacote.
2. Crie a pasta `api` (se ainda não existir) e dentro dela crie `offers.js`, copiando o conteúdo deste pacote.
3. Na raiz, confira `package.json` e `vercel.json`; crie ou substitua os conteúdos pelos arquivos deste pacote.
4. Faça commit das alterações no GitHub.
5. No Vercel, confirme que o projeto está conectado ao repositório correto e aguarde o novo deployment.
6. Abra `https://SEU-PROJETO.vercel.app/api/offers` para testar a API, e depois abra a página inicial.

## Limitações importantes
- O código tenta usar a API oficial de busca pública do Mercado Livre. O Mercado Livre pode exigir autenticação, restringir endpoints ou mudar políticas; se retornar 401/403, a página mostrará uma mensagem explicando.
- Não há garantia de encontrar todas as promoções, nem de que `original_price` esteja preenchido. O app não inventa preços nem calcula desconto quando não há preço original confiável.
- Esta versão não cria links de afiliado. Os links exibidos são os links do anúncio recebidos da API.
- O Vercel oferece uma camada gratuita com limites sujeitos às regras do plano.
- Não insira client secret nem access token no HTML público. Se a autenticação for necessária, configure variáveis de ambiente no Vercel e use-as apenas no backend.
