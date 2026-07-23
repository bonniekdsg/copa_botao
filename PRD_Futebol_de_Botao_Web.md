# PRD — Futebol de Botão (Web)

**Produto:** Jogo de Futebol de Botão para navegador
**Versão do documento:** 1.0
**Data:** 22/07/2026
**Autor:** André
**Status:** Rascunho para aprovação
**Plataforma:** Web (navegador desktop; suporte a mobile como objetivo secundário)
**Escopo desta versão:** MVP — partidas locais e online para dois jogadores, sem banco de dados

---

## 1. Visão geral

O produto é uma adaptação digital fiel do clássico **futebol de botão** (também conhecido como futebol de mesa ou, internacionalmente, no estilo *Subbuteo*). Dois jogadores se enfrentam controlando um time de botões sobre um campo visto de cima. Em vez de dar "petelecos" com o dedo, o jogador usa uma **palheta** (a régua/palheta tradicional do jogo) que ele arrasta com o mouse/toque para empurrar e lançar seus botões em direção à bola.

A partida acontece **em turnos alternados**: um jogador executa uma jogada (um lance com um único botão), a física resolve o movimento até tudo parar, e então passa a vez ao adversário. O objetivo é fazer o botão atingir a bola, conduzi-la pelo campo e, ao chegar em região de finalização, **chutar a bola** para dentro do gol adversário.

Esta primeira versão (MVP) entrega o núcleo jogável: física dos botões e da bola, controle por palheta, sistema de turnos, detecção de gol, regra de falta por colisão indevida, e fim de partida por placar/tempo de jogadas.

### 1.1 Problema / oportunidade

Não existem muitas adaptações web modernas e fiéis do futebol de botão. A maioria são apps mobile fechados ou jogos antigos em Flash (descontinuado). Há uma oportunidade de oferecer uma versão leve, rodando direto no navegador, que respeite as regras tradicionais do esporte de mesa e permita partidas locais rápidas entre dois amigos.

### 1.2 Objetivos do produto

- Reproduzir de forma fiel a **mecânica de arraste com palheta** para empurrar/chutar o botão.
- Entregar uma **física previsível e justa** (colisões, atrito, ricochete) que recompense a habilidade do jogador.
- Implementar o **sistema de turnos** e as **regras principais** (gol, falta e rebote nas bordas).
- Rodar bem no navegador sem instalação, com carregamento rápido.

### 1.3 Não-objetivos (fora do escopo do MVP)

- Inteligência artificial (jogar contra o computador).
- Modo campeonato, ligas, ranking ou progressão.
- Customização avançada de times, uniformes e formações.
- Contas de usuário, login e persistência em nuvem.
- Áudio elaborado / narração (apenas efeitos sonoros básicos são desejáveis, não obrigatórios).

Esses itens são candidatos naturais para versões futuras (ver Seção 11 — Roadmap).

---

## 2. Público-alvo e personas

**Persona primária — "A dupla casual":** dois amigos/colegas/familiares que compartilham um computador ou tablet e querem uma partida rápida e divertida de 5–15 minutos, sem instalar nada. Podem nunca ter jogado futebol de botão físico.

**Persona secundária — "O nostálgico do botão":** pessoa que jogou futebol de botão físico e busca uma versão digital que respeite as regras tradicionais (falta ao bater no botão adversário antes da bola, três toques, etc.).

---

## 3. Fluxo do jogador (experiência principal)

1. O jogador abre a página; vê a tela inicial com o botão **"Jogar"**, sem seleção de lado ou saída.
2. Em uma tela própria, o Jogador 1 e o Jogador 2 escolhem e confirmam seus times separadamente. Os dois podem escolher o mesmo time; nessa situação, o Jogador 2 recebe automaticamente a camisa alternativa para diferenciar os lados.
3. Após as duas confirmações, uma moeda animada — com uma face para cada jogador — sorteia quem dá a saída.
4. A partida carrega: campo visto de cima, times posicionados, bola no centro e o jogador sorteado com a posse.
5. O jogo indica de quem é a vez.
6. O jogador da vez **seleciona um de seus botões**.
7. Aparece a **palheta** junto ao botão selecionado; o jogador **arrasta** para trás (mirar e definir força) e **solta** para lançar o botão.
8. A física resolve o lance: o botão desliza, colide com a bola e/ou outros botões, tudo desacelera pelo atrito e para.
9. O sistema avalia o resultado (gol? falta? bola pra fora? toque válido?) e **passa a vez** ao adversário (ou concede lance extra / falta, conforme as regras).
9. Ciclo se repete até o fim da partida (placar-alvo ou limite de lances/tempo).
10. Tela de fim de jogo com placar e opção de **revanche**.

### 3.1 Fluxo online

1. O Jogador 1 cria uma sala em memória e recebe um código compartilhável.
2. O Jogador 2 entra pelo código em outro computador.
3. Cada jogador controla e confirma apenas o próprio time.
4. O servidor sorteia quem começa e cria o estado autoritativo.
5. Cada lançamento é enviado ao servidor, que valida a vez, calcula a física e distribui o mesmo estado aos dois navegadores.
6. Em queda de conexão, o jogador possui até 45 segundos para recuperar seu lugar usando o identificador temporário salvo na sessão do navegador.

---

## 4. Regras de jogo (baseadas no futebol de botão tradicional)

Estas regras definem o comportamento esperado do MVP. Onde o futebol de botão tradicional tem variações regionais, adotamos uma convenção simples e a documentamos.

### 4.1 Composição e campo

- Cada time possui **10 botões de linha e um goleiro**, totalizando 11 peças numeradas de 1 a 11. A formação inicial é um 4–3–3 espelhado entre as equipes.
- O **campo** é retangular, visto de cima, com linhas de marcação, círculo central, grandes áreas e dois gols nas extremidades.
- A **bola** é um objeto físico único, menor e mais leve que os botões.

### 4.2 Turnos e "toques"

- Os jogadores **se alternam**. Uma "vez" (jogada) consiste em lançar **um único botão**.
- Adota-se a regra clássica dos **três toques**: o mesmo jogador pode encadear **até 3 lances consecutivos** desde que, a cada lance, seu botão **toque a bola**. Se um lance **não tocar a bola**, a vez passa imediatamente ao adversário.
  - *Simplificação alternativa para o MVP (Q2):* pode-se começar com "1 lance por vez" para reduzir complexidade e habilitar os 3 toques em seguida. A decisão deve ser tomada no início do desenvolvimento.
- O turno termina e passa ao adversário quando: o jogador usou os 3 toques, ou um lance não tocou a bola, ou ocorreu falta, gol, ou bola para fora.

### 4.3 A jogada com a palheta

- O jogador seleciona um botão seu. A **palheta** aparece atrás do botão (do lado oposto à direção desejada).
- **Mirar e dar força:** o jogador arrasta o cursor/toque para definir **direção** (linha do botão até o ponto de mira) e **força** (distância/deslocamento do arraste, com um teto máximo).
- **Empurrar (condução):** lances de força baixa/média servem para **empurrar o botão em direção à bola** e conduzi-la pelo campo.
- **Chutar:** quando o botão que toca a bola está dentro de uma **região de finalização** definida (ex.: dentro ou próximo à grande área adversária), o contato botão→bola é tratado como **chute**, transferindo mais energia à bola em direção ao gol. Fora dessa região, o contato é um **passe/condução** comum.
- Ao **soltar**, o botão é lançado; nenhum novo comando é aceito até tudo parar.

### 4.4 Falta (regra central pedida)

- Se, durante o lance, o **botão em movimento atingir um botão do adversário ANTES de tocar a bola**, é marcada **FALTA** contra quem lançou.
- Consequência da falta no MVP: **a posse passa ao adversário**, que ganha um **lance livre** a partir da posição da bola (ou da posição da infração — definir; ver Q3). Faltas dentro da grande área podem gerar **pênalti** (opcional para o MVP; ver Q4).
- A gravidade considera a velocidade relativa do impacto: abaixo de 30% da velocidade máxima é falta comum, de 30% a 70% gera amarelo e acima de 70% gera vermelho direto.
- O segundo amarelo do mesmo botão resulta em vermelho. A terceira falta total da equipe ou a segunda falta consecutiva também força pelo menos um amarelo.
- Um botão expulso é retirado até o fim da partida, inclusive após gols e reposicionamentos.
- Encostar o próprio botão em outro **botão do próprio time** antes da bola **não** é falta, mas encerra o turno (lance sem toque na bola) — ou é tratado conforme convenção escolhida (Q5).
- Tocar a bola **primeiro** e só depois colidir com botões é **jogada válida**.

### 4.5 Gol

- **Gol é marcado quando a bola cruza completamente a linha frontal das traves do gol adversário**, entre as traves. A linha branca externa do campo não é usada como referência para essa detecção.
- Ao confirmar o gol, o jogo toca o apito e exibe uma comemoração visual em tela cheia por aproximadamente 2,8 segundos. A torcida ambiente continua durante a comemoração; a partida ou o resultado final só reaparece depois desse feedback.
- Após o gol: placar é atualizado, os times voltam à **formação inicial**, a bola volta ao **centro**, e a **saída** é dada pelo time que sofreu o gol.

### 4.6 Rebote nas bordas

- A bola permanece em jogo quando atinge as linhas laterais ou o fundo do campo fora da abertura do gol.
- Ao atingir uma dessas bordas, a bola é mantida dentro do campo e sua velocidade é refletida, com perda de energia.
- O impacto da bola na borda reproduz o mesmo efeito sonoro usado para impactos dos botões na borda.
- Não existem cobranças de lateral, escanteio ou tiro de meta.

### 4.7 Goleiro

- O goleiro é um botão especial próximo ao gol e pode ser **movido pelo jogador como parte de um lance** usando a palheta.
- O goleiro fica restrito aos limites da **grande área do próprio time**, inclusive quando é empurrado por outra peça.

### 4.8 Fim de partida

- A partida termina por um destes critérios (configurável): **primeiro a X gols**, **limite de lances/turnos**, ou **tempo real**. Padrão sugerido para o MVP: **primeiro a 3 gols** ou **limite de lances**, o que ocorrer primeiro.
- Empate (se houver limite de tempo/lances): exibir "Empate" e oferecer revanche. Prorrogação/pênaltis ficam fora do MVP.

---

## 5. Requisitos funcionais

Prioridade: **P0** = essencial para o MVP; **P1** = desejável no MVP se houver tempo; **P2** = futuro.

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-01 | Renderizar o campo visto de cima com marcações e dois gols. | P0 |
| RF-02 | Posicionar dois times de botões e a bola em formação inicial. | P0 |
| RF-03 | Alternar turnos entre Jogador 1 e Jogador 2, com indicação visual clara de quem joga. | P0 |
| RF-04 | Permitir selecionar um botão do time da vez. | P0 |
| RF-05 | Exibir a palheta atrás do botão selecionado. | P0 |
| RF-06 | Capturar arraste (mouse/toque) para definir direção e força, com indicador visual de mira e potência. | P0 |
| RF-07 | Lançar o botão ao soltar, aplicando força proporcional ao arraste (com teto máximo). | P0 |
| RF-08 | Simular física: movimento, atrito/desaceleração, colisões botão↔bola, botão↔botão, e ricochete nas bordas. | P0 |
| RF-09 | Detectar quando todos os corpos pararam para encerrar o lance. | P0 |
| RF-10 | Detectar contato botão↔bola e classificar como passe ou chute conforme a região de finalização. | P0 |
| RF-11 | Detectar FALTA: colisão com botão adversário antes de tocar a bola. | P0 |
| RF-12 | Detectar GOL (bola cruza a linha entre as traves) e atualizar placar. | P0 |
| RF-13 | Aplicar regra de três toques (encadear lances enquanto tocar a bola). | P0 |
| RF-14 | Resetar formação e bola ao centro após gol; conceder a saída. | P0 |
| RF-15 | Manter a bola em jogo com ricochete e perda de energia ao atingir laterais ou fundo fora da abertura do gol. | P0 |
| RF-16 | Aplicar consequência da falta (lance livre / troca de posse). | P0 |
| RF-16A | Aplicar amarelo, segundo amarelo e vermelho direto conforme impacto e reincidência; remover o botão expulso. | P0 |
| RF-17 | Exibir placar e cronômetro/contador de lances durante a partida. | P0 |
| RF-18 | Detectar fim de partida e mostrar tela de resultado com revanche. | P0 |
| RF-19 | Prevenir input durante a resolução da física (bloquear até tudo parar). | P0 |
| RF-20 | Permitir que cada jogador escolha e confirme seu time independentemente, inclusive com escolhas repetidas; aplicar a camisa alternativa ao Jogador 2 quando os times forem iguais. | P0 |
| RF-20A | Sortear quem começa com uma moeda animada, usando uma face para cada jogador, e iniciar a partida com o vencedor. | P0 |
| RF-21 | Usar `sound_background.mp3` exclusivamente como ambiente da tela inicial, `clique.wav` nos botões da interface, `chute.wav` no contato com a bola, `apito.mp3` no início, após gols e nas saídas pelas laterais ou linhas de fundo, `torcida.mp3` durante a partida e `final.mp3` no encerramento. | P1 |
| RF-22 | Botão de "desfazer" apenas antes de soltar o lance (cancelar mira). | P1 |
| RF-23 | Modelo de goleiro jogável ou automático simplificado. | P1 |
| RF-24 | Suporte a toque (mobile) com layout responsivo. | P1 |
| RF-25 | Pênalti para faltas dentro da área. | P2 |
| RF-26 | IA / modo 1 jogador. | P2 |
| RF-27 | Criar e entrar em partidas online por código de sala, com dois computadores. | P0 |
| RF-27A | Manter salas, jogadores e partidas somente na memória, sem banco de dados. | P0 |
| RF-27B | Executar física e regras no servidor e sincronizar o mesmo estado aos dois clientes. | P0 |
| RF-27C | Bloquear ações fora da vez e permitir reconexão temporária do mesmo jogador. | P0 |

---

## 6. Modelo de física e jogabilidade (diretrizes)

- **Motor:** física 2D determinística e estável é preferível. O sistema deve dar resultados consistentes e "justos": mesmo lance ⇒ resultado equivalente.
- **Corpos:** botões e bola modelados como **discos** com raio, massa e atrito. Botões têm mais massa que a bola.
- **Força do lance:** proporcional ao vetor de arraste (direção = do botão ao cursor invertido; magnitude = comprimento do arraste, saturada em um máximo). Deve haver **feedback visual** (seta/linha e barra de potência) antes de soltar.
- **Atrito:** desaceleração contínua até parada, simulando o feltro do campo. Ajustável para controlar quão "corridos" são os lances.
- **Colisões:** elásticas o suficiente para ricochetes plausíveis. A **ordem dos contatos** importa (primeiro contato define falta vs. jogada válida) — é crítico registrar **qual objeto foi tocado primeiro** pelo botão lançado.
- **Região de finalização (chute):** área geométrica definida (ex.: dentro/junto à grande área adversária). Quando o **botão que toca a bola** está nessa região no momento do contato, aplica-se multiplicador de energia para caracterizar o chute.
- **Condição de parada:** quando a velocidade de todos os corpos cai abaixo de um limiar por N frames, o lance é considerado encerrado.

---

## 7. Máquina de estados da partida (alto nível)

```
INICIO
  → SELECAO_DE_TIMES (confirmações independentes; times podem se repetir)
  → SORTEIO_DA_MOEDA (Jogador 1 × Jogador 2)
  → POSICIONAMENTO (formação inicial, bola ao centro; sorteado dá a saída)
  → VEZ_DO_JOGADOR (aguarda seleção de botão)
      → MIRANDO (palheta visível, arraste ativo)
      → LANCE_EM_RESOLUCAO (física rodando, input bloqueado)
          → AVALIACAO:
              - GOL?        → PLACAR++ → POSICIONAMENTO (saída do que sofreu)
              - FALTA?      → LANCE_LIVRE (troca de posse) → VEZ_DO_JOGADOR
              - TOCOU_BOLA? → se toques < 3: mesmo jogador (MIRANDO); senão troca de vez
              - SEM_TOQUE?  → troca de vez → VEZ_DO_JOGADOR
      → checar FIM_DE_PARTIDA a cada avaliação
  → FIM (tela de resultado + revanche)
```

### 7.1 Arquitetura online

- Um servidor Node.js entrega os arquivos estáticos e aceita conexões WebSocket em `/ws`.
- As salas são armazenadas em um `Map` na memória do processo.
- O cliente envia intenções de jogada; posições, placar, faltas, saídas e gols são determinados pelo motor autoritativo do servidor.
- A simulação usa passo fixo de 120 Hz e transmite snapshots em cerca de 30 Hz.
- O servidor aceita no máximo dois lugares por sala, limita mensagens por conexão e remove sessões desconectadas após a janela de reconexão.

---

## 8. Requisitos de UI / UX

- **Tela inicial:** título, "Jogar (2 jogadores)", acesso rápido às regras.
- **HUD da partida:** placar dos dois lados, indicador de vez (cor/nome), contador de toques restantes (1–3), contador de lances/tempo.
- **Indicador de mira:** linha/seta a partir do botão + barra de potência enquanto arrasta.
- **Feedback de eventos:** destaque visual e (P1) sonoro para gol, falta (apito), bola para fora.
- **Clareza de turno:** impossível o jogador errado agir; botões do time inativo aparecem esmaecidos.
- **Responsivido (P1):** funcionar com mouse (desktop) e toque (tablet). Alvos de toque adequados.
- **Acessibilidade:** contraste suficiente entre os dois times; não depender apenas de cor para indicar a vez (usar rótulo textual também).

---

## 9. Requisitos não-funcionais

- **Desempenho:** 60 FPS na simulação em desktops modernos; carregamento inicial rápido (jogo leve, sem downloads pesados).
- **Compatibilidade:** navegadores atuais baseados em Chromium, Firefox e Safari (últimas 2 versões).
- **Sem instalação / sem backend:** o MVP roda 100% no cliente; nenhuma conta ou servidor necessário.
- **Justiça/Determinismo:** a física não deve favorecer aleatoriamente um lado; resultados reproduzíveis.
- **Robustez:** o jogo nunca deve "travar" em um estado sem saída (ex.: bola parada em local inacessível deve ter regra de recuperação/timeout).

---

## 10. Métricas de sucesso

- **Partidas concluídas:** % de partidas iniciadas que chegam ao fim (alvo: > 70%).
- **Tempo médio de partida:** dentro de 5–15 min.
- **Retorno/revanche:** % de partidas seguidas de uma revanche imediata.
- **Clareza das regras:** em testes de usabilidade, novos jogadores entendem turnos, chute e falta sem ajuda externa (alvo: > 80%).
- **Estabilidade:** zero travamentos de estado em sessões de teste.

---

## 11. Roadmap / versões futuras

- **v1.1:** goleiro jogável refinado, pênaltis e efeitos sonoros completos.
- **v1.2:** IA (modo 1 jogador) com níveis de dificuldade.
- **v1.3:** customização de times/uniformes, formações salvas.
- **v2.0:** multiplayer online (turnos assíncronos ou tempo real), ranking e torneios.

---

## 12. Questões em aberto (a decidir antes/durante o desenvolvimento)

- **Q1. Resolvida.** Cada time usa 10 jogadores de linha e um goleiro, em formação inicial 4–3–3.
- **Q2.** Começar com "1 lance por vez" ou já implementar a regra dos 3 toques?
- **Q3.** Lance livre após falta: repor na posição da bola ou no ponto da infração?
- **Q4.** Incluir pênalti (falta na área) já no MVP ou deixar para v1.1?
- **Q5.** Colidir com botão do próprio time antes da bola: só encerra o turno ou tem outra consequência?
- **Q6. Resolvida.** A bola permanece em jogo e rebate nas laterais e no fundo, com perda de energia.
- **Q7. Resolvida.** O goleiro é jogável e sua movimentação fica limitada à grande área do próprio time.
- **Q8.** Critério padrão de fim de jogo: primeiro a 3 gols, limite de lances, ou tempo?

---

## 13. Glossário

- **Botão:** peça (disco) que o jogador controla; representa um jogador de linha ou o goleiro.
- **Palheta:** régua/peça que o jogador manipula (arrasta) para empurrar e lançar o botão.
- **Lance:** uma ação de lançar um único botão.
- **Toque:** contato do botão com a bola; base da regra dos "três toques".
- **Falta:** infração por atingir um botão adversário antes de tocar a bola.
- **Região de finalização:** área do campo onde o contato botão→bola é tratado como chute.
- **Hot-seat:** dois jogadores alternando o controle no mesmo dispositivo.
