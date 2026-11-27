---
source: 6f29a4870b425665
title: Projetos
description: Como adicionar um projeto ao Infinitary, reunir vários repositórios em um só, criar etiquetas para ele, focar a janela em um deles, escolher como as mudanças dele são mescladas e removê-lo.
---

Um projeto é aquilo em que sua tripulação trabalha: um repositório, ou vários que andam juntos, como um app e o serviço dele.
Um repositório é uma pasta sua, mantida com git.
Toda tarefa pertence a um projeto, e toda chave de tarefa começa com a chave do projeto dela, como `WEB-12`.
Seus projetos ficam listados em **Ajustes → Projetos**, e pressionar a linha de um projeto abre a página dele.

## Adicionar um projeto {#add-a-project}

Você pode adicionar um projeto de dois jeitos.

- **Peça ao seu imediato.**
  Diga em qual projeto trabalhar, por exemplo “Clone o projeto em” seguido do link dele.
  Seu imediato traz um cartão que diz qual é o projeto e os ajustes dele.
  Nada é adicionado até você pressionar **Adicionar projeto** nesse cartão.
- **Adicione você mesmo.**
  Abra **Ajustes → Projetos** e use a linha **Adicionar projeto** no pé da lista.

A linha **Adicionar projeto** tem três botões:

1. **Pasta neste computador** adiciona uma pasta que você já tem.
   Se a pasta ainda não usa git, o Infinitary inicia o git nela com um primeiro commit vazio.
2. **Repositório do GitHub**, **Repositório do GitLab** ou **Repositório do Bitbucket** clona um projeto de onde ele fica.
   Escolha-o em **Seus repositórios do GitHub**, use **Buscar um repositório** para procurar ou cole o link dele.
   Com muitos repositórios, alguns podem não ter sido verificados, e a lista avisa; cole um link para adicionar um que esteja faltando.
3. **Novo projeto** cria um projeto vazio com o nome que você digitar.

Um projeto clonado ou novo vai para a sua pasta de projetos.
A linha **Novos projetos vão para** mostra essa pasta, e **Escolher pasta** a muda.
Os projetos que você já adicionou nunca saem do lugar quando você a muda.

**Chave das tarefas** é opcional.
Digite até quatro letras ou números, e as tarefas do próximo projeto são numeradas com ela.
Deixe em branco, e o Infinitary cria uma chave a partir do nome do projeto.

Para um projeto em outro host, peça ao seu imediato.

## Seu login do GitHub, do GitLab ou do Bitbucket {#your-github-gitlab-or-bitbucket-sign-in}

Para clonar um projeto e oferecer as mudanças dele, o Infinitary usa seu login do GitHub, do GitLab ou do Bitbucket.

Se você não tiver feito login quando pressionar **Repositório do GitHub**, **Repositório do GitLab** ou **Repositório do Bitbucket**, a linha mostra **Fazer login no GitHub**, **Fazer login no GitLab** ou **Fazer login no Bitbucket** em vez dos seus projetos.
Esse botão abre **Ajustes → Integrações**, onde ficam seus logins; veja [Integrações](/pt-br/integrations/).
No GitHub, você digita um código na página do GitHub no seu navegador.
No GitLab, você pode fazer login no navegador ou colar uma chave, no gitlab.com ou no seu próprio servidor GitLab.
No Bitbucket, você cria um token de API na sua conta da Atlassian e cola, para projetos no bitbucket.org.
O formulário da chave diz quais escopos marcar na página da Atlassian.
Para o seu próprio servidor Bitbucket Data Center, versão 8.19 ou mais recente, você informa o endereço dele e cola um token de acesso HTTP com as permissões Project read e Repository write.
As mudanças de um projeto do Data Center são oferecidas como solicitações de pull, e a mesclagem só acontece na versão que você aprovou: se alguém fizer push nesse meio-tempo, nada é mesclado e a tarefa avisa.
Um projeto do Data Center também pode escolher solicitações de pull em lote, e sua tripulação pode ler e escrever no servidor, contribuir pelo seu fork e acordar com comentários novos na solicitação de pull dela e com uma verificação que falhou no branch principal.
Um servidor Data Center não guarda registros de verificação, execuções nem arquivos de versão próprios: as verificações dele vêm de outro serviço, e cada uma leva ao lugar onde está o registro.
Seus projetos do Bitbucket são listados a partir dos espaços de trabalho de que você faz parte; com muitos, alguns podem não ter sido verificados, e a lista avisa.
As mudanças de um projeto do Bitbucket são oferecidas como solicitações de pull, como no GitHub e no GitLab; um projeto que você adicionou antes disso funciona do mesmo jeito a partir da próxima tarefa.
A descrição de uma solicitação de pull do Bitbucket traz a história como texto, e as imagens dela ficam no cartão.
Um projeto do Bitbucket também pode escolher solicitações de pull em lote, e as mesclagens dele seguem as estratégias e a fila de mesclagem que o branch principal dele tem no bitbucket.org.
Em um projeto do Bitbucket, sua tripulação também pode ler os pipelines do projeto e o log de uma etapa, colocar um arquivo de versão em Downloads e acordar com novos comentários na solicitação de pull dele, como no GitHub e no GitLab; o Bitbucket não oferece download dos artefatos de um pipeline.
Seu login fica neste computador.

Se um login parar de funcionar, um cartão pede que você faça login de novo.
O trabalho que precisa dele espera até você fazer isso.

## Vários repositórios em um projeto {#several-repositories-in-one-project}

Um projeto começa com um repositório e pode ter mais.
A página dele os lista em **Repositórios**, com uma aba para cada um.

Você pode adicionar um repositório a um projeto de dois jeitos.

- **Peça ao seu imediato.**
  Diga em qual projeto o repositório entra.
  Seu imediato traz um cartão, e nada é adicionado até você pressionar **Adicionar repositório** nele.
- **Adicione você mesmo.**
  Pressione **Adicionar um repositório**, depois da última aba, e escolha uma pasta, um repositório para clonar ou **Novo repositório**, como você faz para um projeto.

As tarefas do repositório usam a chave das tarefas do projeto.
Cada tarefa trabalha em um só repositório, e a aba **Info** da tarefa mostra o nome dele ao lado do projeto.
Cada repositório mantém os próprios ajustes, como **Para onde vão as alterações**, **Perguntar antes de mesclar** e **Cuidado**: escolha a aba dele para mudá-los.
Um projeto com vários repositórios tem um nome próprio, que você muda em **Nome**, na caixa **Projeto**.

## Mover um repositório para outro projeto {#move-a-repository-to-another-project}

Um repositório pode ir para outro projeto ou para um projeto próprio.

- **Peça ao seu imediato.**
  Quando você diz exatamente qual repositório vai para qual projeto, a mudança acontece na hora.
  Quando é seu imediato quem sugere a mudança, um cartão mostra para onde vai cada repositório e quais tarefas vão junto, e nada sai do lugar até você pressionar **Aplicar mudança**.
- **Mova você mesmo.**
  Na aba do repositório, escolha um projeto na linha que oferece movê-lo para outro projeto, pressione **Mover** e pressione **Mover** de novo para confirmar.

O repositório mantém o nome, a pasta e os ajustes.
As tarefas dele vão junto, e cada uma mantém a própria chave.
Um projeto que fica sem nenhum repositório sai da lista: as tarefas que restam nele, as etiquetas e as automações dele passam para o outro projeto, e a chave dele nunca mais é usada.
Para juntar dois projetos, mova os repositórios de um para o outro.

## Etiquetas {#tags}

Cada projeto tem a própria lista de etiquetas, como bug, recurso ou ideia.
Uma etiqueta tem um nome e uma descrição que diz quais tarefas se encaixam nela.
As etiquetas ajudam você a encontrar e agrupar tarefas, e o Infinitary não faz mais nada com elas.

A página de um projeto lista as etiquetas dele em **Etiquetas**, cada uma com o número de tarefas que a levam.

- **Sugerir etiquetas**, que aparece enquanto um projeto não tem etiquetas, pede ao seu imediato que leia as tarefas do projeto e responda com um cartão de etiquetas sugeridas que você pode mudar respondendo.
- **Adicionar uma etiqueta** pede o nome da etiqueta e quais tarefas se encaixam nela.
- **Editar** muda o nome ou a descrição de uma etiqueta.
  Uma etiqueta que muda de nome continua nas tarefas que a levam.
- **Remover** tira a etiqueta de todas as tarefas que a levam, depois de uma pergunta que diz quantas são.

Você também pode pedir ao seu imediato para adicionar, mudar ou remover as etiquetas de um projeto.
Uma tarefa que vai para outro projeto perde as etiquetas, a não ser que todo o projeto dela tenha se juntado a esse outro.
Para etiquetar uma tarefa e para encontrar tarefas por etiqueta, veja [Tarefas e tripulantes](/pt-br/tasks-and-crewmates/#tags).

## Cópias de trabalho {#working-copies}

Sua tripulação nunca trabalha direto na pasta do seu projeto.
Cada tripulante trabalha na própria cópia de trabalho do seu projeto, no próprio branch.
Seus arquivos ficam como estão até você mesclar uma mudança.

## Focar em um projeto {#focus-on-one-project}

Com dois projetos ou mais, a barra do topo mostra uma pílula de projeto.
Pressione-a, ou pressione ⇧⌘P (Ctrl+Shift+P no Linux e no Windows), para abrir uma fileira com seus projetos.
Cada pílula conta as tarefas que aguardam você e as tarefas que estão trabalhando.
Escolha um projeto para focar a janela nele.

Enquanto um projeto está em foco:

- O painel Tarefas e o quadro de tarefas mostram só as tarefas desse projeto.
- Atividade mostra só as linhas sobre esse projeto e as linhas que não são de nenhuma tarefa.
- Os cartões sobre outros projetos esperam até o foco mudar.
  Nada é fechado, e todos os projetos continuam mandando avisos.
- Uma linha curta ao lado da pílula diz quantas tarefas aguardam você em outros projetos, como “2 aguardando em outros projetos”.
- Seu imediato fica sabendo do foco a cada mensagem que você envia.
  A não ser que você cite outro projeto, ele põe o trabalho novo nesse projeto, e suas respostas e ações sobre muitas tarefas cobrem só esse projeto e dizem o que deixaram de fora.

Para ver onde o trabalho de um projeto está rodando sem focar nele, aponte para um tripulante no centro da janela, ou toque nele no seu celular.
Enquanto o resumo dele está aberto, cada tripulante de outro projeto fica com um quarto da luz, em cada computador, e ninguém se move.
Feche o resumo e a luz volta.

Pressione o **×** ao lado da pílula (**Mostrar todos os projetos**), ou escolha **Todos os projetos** na fileira, para ver tudo de novo.
O Infinitary lembra do seu foco quando você o reinicia.

## Como as mudanças chegam ao seu projeto {#how-changes-reach-your-project}

Abra um projeto em **Ajustes → Projetos** para escolher como o trabalho terminado dele é mesclado.
**Para onde vão as alterações** oferece:

- **solicitações de pull**: cada mudança é oferecida como uma solicitação de pull no GitHub, no GitLab ou no Bitbucket.
- **solicitações de pull em lote**: suas mudanças aprovadas são combinadas em uma única solicitação de pull em lote, com um commit para cada mudança, e mescladas assim que as verificações dela passam.
- **mesclagem local**: a mudança é mesclada no projeto neste computador, sem solicitação de pull.

Um projeto que fica só neste computador oferece apenas **mesclagem local**.

Quando uma mudança está pronta, o tripulante dela traz um cartão de mesclagem.
O botão do cartão diz o que ele faz, como **Mesclar a solicitação de pull**, **Mesclar o branch** ou **Mesclar no próximo lote**.
Se as verificações ainda estiverem em execução, o botão diz **Mesclar quando as verificações passarem**, e o Infinitary mescla assim que elas passarem.

**Perguntar antes de mesclar** decide quem mescla.
Ele vem ligado em um projeto novo, então o trabalho terminado espera a sua palavra.
Desligue-o, e o trabalho que passa nas verificações pode ser mesclado sem perguntar a você.

**Cuidado** define o quanto o trabalho é verificado: **Rápido**, **Padrão** ou **Cuidadoso**.

**Fluxos de trabalho informativos** indica os arquivos de fluxo de trabalho de um projeto do GitHub, como `.github/workflows/early-tests.yml`, cujas verificações aparecem em cada alteração, mas nunca seguram a mesclagem nem o lote.
Digite os arquivos separados por vírgulas e pressione **Salvar**.
Uma verificação que suas regras de branch no GitHub exigem continua segurando a mesclagem no GitHub.

**Informar a ajuda de IA** fica ligado em um projeto cujas mudanças passam por solicitações de pull.
Quando um tripulante revisa a solicitação de pull de outra pessoa, o comentário que ele publica começa com uma linha dizendo que um tripulante do Infinitary o escreveu.
Mude a linha e pressione **Salvar**, ou desligue a chave para deixá-la de fora.

## Remover um projeto {#remove-a-project}

1. Abra o projeto em **Ajustes → Projetos**.
2. Pressione **Remover** na última linha dele.
3. Pressione **Remover** de novo para confirmar.

Remover tira o projeto da lista.
A pasta dele e as tarefas terminadas ficam.
Se você adicioná-lo de novo, o Infinitary usa a pasta que ele deixou na sua pasta de projetos em vez de clonar uma segunda cópia, e o projeto recomeça com os ajustes padrão.
Se o projeto ainda tiver tarefas, o Infinitary diz quais são, e você as termina ou abandona antes.

Em um projeto com vários repositórios, **Remover** tira o repositório cuja aba está escolhida, e o projeto fica com os outros.

## Próximos passos {#next}

- [Tarefas e tripulantes](/pt-br/tasks-and-crewmates/)
- [Cartões e decisões](/pt-br/cards-and-decisions/)
