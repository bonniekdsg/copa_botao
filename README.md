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

## Publicar no Render

O arquivo `render.yaml` configura o jogo como um único Web Service Node.js, com WebSocket, endpoint de saúde e deploy automático a cada push na branch principal.

1. No painel do Render, selecione **New > Blueprint**.
2. Conecte o repositório `bonniekdsg/copa_botao`.
3. Confirme a criação do serviço `copa-botao`.
4. Aguarde o health check de `/health` ficar disponível.
5. Abra o endereço `https://copa-botao.onrender.com` informado pelo Render.

O plano gratuito entra em suspensão após um período sem tráfego. A primeira abertura depois disso pode levar cerca de um minuto. Uma nova conexão ou mensagem WebSocket reativa e mantém o serviço em uso. Como as salas ficam na memória, uma reinicialização ou novo deploy encerra as partidas abertas.

Mantenha apenas uma instância enquanto o jogo não usar armazenamento compartilhado. Para evitar suspensão por inatividade, altere o tipo da instância no painel do Render para um plano pago.

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
- A bola rebate nas laterais e no fundo do campo, permanecendo em jogo.
- Os rebotes nas bordas perdem parte da velocidade e produzem o efeito sonoro de impacto.
- Cada goleiro pode ser lançado normalmente, mas permanece dentro da grande área do seu time.
- Atingir um rival antes da bola é falta. Impactos médios geram amarelo, impactos fortes geram vermelho direto e o segundo amarelo expulsa o botão.

Faltas simples exibem um aviso por 3,5 segundos e cartões, por 5 segundos. Os avisos entram em uma fila para não se sobrescreverem e podem ser fechados antes. Alertas de conexão permanecem visíveis até a reconexão.

Vence quem marcar três gols. Ao marcar, a imagem de comemoração ocupa a tela por alguns segundos; depois, o campo retorna para a nova saída. Se ninguém chegar a três, a partida termina após 40 lances.

O áudio usa os arquivos da pasta `assets`: `sound_background.mp3` exclusivamente como ambiente da tela inicial, clique nos controles, chute ao atingir a bola, efeito de borda nos ricochetes, apito na abertura da partida e após cada gol, torcida ambiente em repetição durante o jogo e `final.mp3` no encerramento.

A música da abertura é pré-carregada com prioridade e começa assim que o navegador permite reprodução automática. Navegadores que bloqueiam áudio sem interação fazem uma nova tentativa no primeiro toque do usuário.

## Testes

O teste do motor não exige instalação de pacotes:

```bash
npm test
```

`tests/online-server.test.cjs` abre dois clientes WebSocket e valida sala, escolha de times, sorteio e autorização da jogada.

Os testes `tests/browser-smoke.mjs` e `tests/browser-online.mjs` usam Chrome DevTools para validar, respectivamente, o modo local e duas abas online com jogada sincronizada e reconexão.
