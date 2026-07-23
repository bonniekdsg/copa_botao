# Copa de Botão

Jogo de futebol de botão para dois jogadores, com partidas locais ou online por código de sala. O cliente usa HTML, CSS e Canvas 2D; o modo online usa Node.js e WebSocket.

Cada equipe possui dez jogadores de linha e um goleiro, distribuídos inicialmente em uma formação 4–3–3.

## Início da partida

### Online

1. Na tela inicial, pressione **Jogar online**.
2. Um jogador cria uma sala e envia o código ou link ao adversário.
3. O segundo jogador abre o jogo em outro computador e informa o código.
4. Cada jogador escolhe e confirma o próprio time. Times iguais são permitidos; o Jogador 2 usa a camisa alternativa.
5. O servidor sorteia a saída e mantém física, regras, placar e turnos sincronizados.

### Local

Pressione **Jogar local** na parte inferior da tela inicial. Os dois jogadores escolhem os times no mesmo computador e jogam alternadamente.

## Executar

No diretório do projeto:

```bash
npm install
npm start
```

Depois, acesse `http://localhost:4173` no navegador.

Para testar entre dois computadores na mesma rede, abra `http://IP-DO-COMPUTADOR:4173` nos dois dispositivos. Para publicar na internet, use uma hospedagem Node.js com HTTPS/WSS e processo persistente; hospedagem exclusivamente estática não executa as salas WebSocket.

## Funcionamento online sem banco

- As salas ficam somente na memória do servidor.
- Cada sala aceita dois jogadores e recebe um código aleatório de cinco caracteres.
- O servidor valida o jogador da vez e calcula a física em passo fixo de 120 Hz.
- Os navegadores recebem o mesmo estado em aproximadamente 30 atualizações por segundo.
- Uma sessão temporária no navegador permite reconectar por até 45 segundos.
- Reiniciar o servidor encerra todas as salas; não há contas, histórico ou ranking.

## Controles

- Pressione um botão do time da vez.
- Arraste na direção oposta ao lance e solte.
- Use `Esc` ou **Cancelar mira** para desistir antes de soltar.
- Cada toque válido na bola mantém a posse, até o limite de três.
- Na lateral, a posse passa ao adversário do último botão que tocou na bola.
- Na linha de fundo, toque da defesa gera escanteio; toque do ataque gera tiro de meta.
- Laterais, escanteios e tiros de meta são cobrados diretamente na bola com o estilingue, sem usar um botão.
- No tiro de meta, a bola começa no canto superior esquerdo da pequena área da equipe defensora.
- Cada goleiro pode ser lançado normalmente, mas permanece dentro da grande área do seu time.
- Atingir um rival antes da bola é falta. Impactos médios geram amarelo, impactos fortes geram vermelho direto e o segundo amarelo expulsa o botão.

Vence quem marcar três gols. Ao marcar, a imagem de comemoração ocupa a tela por alguns segundos; depois, o campo retorna para a nova saída. Se ninguém chegar a três, a partida termina após 40 lances.

O áudio usa os arquivos da pasta `assets`: `sound_background.mp3` exclusivamente como ambiente da tela inicial, clique nos controles, chute ao atingir a bola, apito na abertura da partida, após cada gol e quando a bola sai pelas laterais ou linhas de fundo, torcida ambiente em repetição durante o jogo e `final.mp3` no encerramento.

A música da abertura é pré-carregada com prioridade e começa assim que o navegador permite reprodução automática. Navegadores que bloqueiam áudio sem interação fazem uma nova tentativa no primeiro toque do usuário.

## Testes

O teste do motor não exige instalação de pacotes:

```bash
npm test
```

`tests/online-server.test.cjs` abre dois clientes WebSocket e valida sala, escolha de times, sorteio e autorização da jogada.

Os testes `tests/browser-smoke.mjs` e `tests/browser-online.mjs` usam Chrome DevTools para validar, respectivamente, o modo local e duas abas online com jogada sincronizada e reconexão.
