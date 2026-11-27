---
source: 6f29a4870b425665
title: Projets
description: Comment ajouter un projet à Infinitary, y réunir plusieurs dépôts, lui donner des étiquettes, concentrer la fenêtre sur un seul projet, choisir comment ses changements sont fusionnés et le retirer.
---

Un projet est ce sur quoi travaille votre équipage : un dépôt, ou plusieurs qui vont ensemble, comme une app et son service.
Un dépôt est un dossier à vous, géré avec git.
Chaque tâche appartient à un projet, et chaque clé de tâche commence par la clé de son projet, comme `WEB-12`.
Vos projets sont listés dans **Réglages → Projets**, et appuyer sur la ligne d’un projet ouvre sa page.

## Ajouter un projet {#add-a-project}

Vous pouvez ajouter un projet de deux façons.

- **Demandez à votre second.**
  Dites sur quel projet travailler, par exemple « Cloner le projet à l’adresse » suivi de son lien.
  Votre second vous apporte une carte qui nomme le projet et ses réglages.
  Rien n’est ajouté tant que vous n’appuyez pas sur **Ajouter un projet** sur cette carte.
- **Ajoutez-le vous-même.**
  Ouvrez **Réglages → Projets** et utilisez la ligne **Ajouter un projet** au pied de la liste.

La ligne **Ajouter un projet** a trois boutons :

1. **Dossier sur cet ordinateur** ajoute un dossier que vous avez déjà.
   Si le dossier n’utilise pas encore git, Infinitary y initialise git avec un premier commit vide.
2. **Dépôt GitHub**, **Dépôt GitLab** ou **Dépôt Bitbucket** clone un projet depuis l’endroit où il est hébergé.
   Choisissez-le dans **Vos dépôts GitHub**, utilisez **Trouver un dépôt** pour chercher, ou collez son lien.
   Avec beaucoup de dépôts, certains peuvent ne pas avoir été vérifiés, et la liste le signale ; collez un lien pour en ajouter un qui manque.
3. **Nouveau projet** démarre un projet vide avec le nom que vous tapez.

Un projet cloné ou nouveau va dans votre dossier de projets.
La ligne **Les nouveaux projets vont dans** affiche ce dossier, et **Choisir un dossier** le change.
Les projets déjà ajoutés ne bougent jamais quand vous le changez.

**Clé des tâches** est facultative.
Tapez jusqu’à quatre lettres ou chiffres, et les tâches du prochain projet sont numérotées avec.
Laissez-la vide, et Infinitary fabrique une clé à partir du nom du projet.

Pour un projet chez un autre hébergeur, demandez à votre second.

## Votre connexion GitHub, GitLab ou Bitbucket {#your-github-gitlab-or-bitbucket-sign-in}

Pour cloner un projet et proposer ses changements, Infinitary utilise votre connexion à GitHub, GitLab ou Bitbucket.

Si vous n’êtes pas connecté quand vous appuyez sur **Dépôt GitHub**, **Dépôt GitLab** ou **Dépôt Bitbucket**, la ligne affiche **Se connecter à GitHub**, **Se connecter à GitLab** ou **Se connecter à Bitbucket** au lieu de vos projets.
Ce bouton ouvre **Réglages → Intégrations**, où se trouvent vos connexions ; voir [Intégrations](/fr/integrations/).
Pour GitHub, vous saisissez un code sur la page de GitHub dans votre navigateur.
Pour GitLab, vous pouvez vous connecter dans votre navigateur ou coller une clé, sur gitlab.com ou sur votre propre serveur GitLab.
Pour Bitbucket, vous créez un jeton d’API sur votre compte Atlassian et vous le collez, pour les projets sur bitbucket.org.
Le formulaire de clé nomme les autorisations à cocher sur la page d’Atlassian.
Pour votre propre serveur Bitbucket Data Center, en version 8.19 ou plus récente, vous saisissez son adresse et collez un jeton d’accès HTTP avec les autorisations Project read et Repository write.
Les changements d’un projet Data Center sont proposés en demandes de tirage, et la fusion ne se fait qu’à la version que vous avez approuvée : si quelqu’un pousse entre-temps, rien n’est fusionné et la tâche le signale.
Un projet Data Center peut aussi choisir les demandes de tirage groupées, et votre équipage peut lire et écrire sur le serveur, contribuer par votre fork, et se réveiller sur les nouveaux commentaires de sa demande de tirage et sur une vérification échouée sur sa branche principale.
Un serveur Data Center ne conserve ni journaux de vérification, ni exécutions, ni fichiers de version qui lui soient propres : ses vérifications viennent d’un autre service, et chacune renvoie à l’endroit où se trouve son journal.
Vos projets Bitbucket sont listés à partir des espaces de travail dont vous faites partie ; s’il y en a beaucoup, certains peuvent ne pas avoir été vérifiés, et la liste le signale.
Les changements d’un projet Bitbucket sont proposés en demandes de tirage, comme sur GitHub et GitLab ; un projet ajouté avant cela fonctionne de la même façon dès sa prochaine tâche.
La description d’une demande de tirage Bitbucket porte le récit sous forme de texte, et ses images restent sur la carte.
Un projet Bitbucket peut aussi choisir les demandes de tirage groupées, et ses fusions suivent les stratégies et la file de fusion de sa branche principale sur bitbucket.org.
Sur un projet Bitbucket, votre équipage peut aussi lire les pipelines du projet et le journal d’une étape, déposer un fichier de version dans ses Downloads et se réveiller à chaque nouveau commentaire sur sa demande de tirage, comme sur GitHub et GitLab ; Bitbucket ne propose pas de télécharger les artefacts d’un pipeline.
Votre connexion reste sur cet ordinateur.

Si une connexion cesse de fonctionner, une carte vous demande de vous reconnecter.
Le travail qui en a besoin attend que vous le fassiez.

## Plusieurs dépôts dans un même projet {#several-repositories-in-one-project}

Un projet commence avec un seul dépôt et peut en contenir d’autres.
Sa page les liste sous **Dépôts**, avec un onglet pour chacun.

Vous pouvez ajouter un dépôt à un projet de deux façons.

- **Demandez à votre second.**
  Dites quel projet le dépôt doit rejoindre.
  Votre second vous apporte une carte, et rien n’est ajouté tant que vous n’appuyez pas sur **Ajouter un dépôt** sur cette carte.
- **Ajoutez-le vous-même.**
  Appuyez sur **Ajouter un dépôt**, après le dernier onglet, et choisissez un dossier, un dépôt à cloner ou **Nouveau dépôt**, comme pour un projet.

Les tâches du dépôt prennent la clé des tâches du projet.
Chaque tâche se déroule dans un seul dépôt, et l’onglet **Infos** de la tâche le nomme à côté du projet.
Chaque dépôt garde ses propres réglages, comme **Où vont les modifications**, **Demander avant de fusionner** et **Soin** : choisissez son onglet pour les changer.
Un projet à plusieurs dépôts porte son propre nom, que **Nom**, dans le cadre **Projet**, permet de changer.

## Déplacer un dépôt dans un autre projet {#move-a-repository-to-another-project}

Un dépôt peut être déplacé dans un autre projet, ou dans un projet à part.

- **Demandez à votre second.**
  Quand vous indiquez précisément le déplacement voulu, il a lieu aussitôt.
  Quand c’est votre second qui en propose un, une carte montre où va chaque dépôt et quelles tâches le suivent, et rien ne bouge tant que vous n’appuyez pas sur **Appliquer le déplacement**.
- **Déplacez-le vous-même.**
  Dans l’onglet du dépôt, choisissez un projet sur la ligne qui propose de déplacer ce dépôt dans un autre projet, appuyez sur **Déplacer**, puis appuyez de nouveau sur **Déplacer** pour confirmer.

Le dépôt garde son nom, son dossier et ses réglages.
Ses tâches le suivent, et chaque tâche garde sa clé.
Un projet qui se retrouve sans dépôt quitte la liste : les tâches qui lui restent, ses étiquettes et ses automatisations rejoignent l’autre projet, et sa clé ne sert plus jamais.
Pour réunir deux projets, déplacez les dépôts de l’un dans l’autre.

## Étiquettes {#tags}

Chaque projet garde sa propre liste d’étiquettes, comme bogue, fonctionnalité ou idée.
Une étiquette a un nom et une description qui dit quelles tâches y entrent.
Les étiquettes vous aident à retrouver et à grouper des tâches, et rien d’autre dans Infinitary n’en tient compte.

La page d’un projet liste ses étiquettes sous **Étiquettes**, chacune avec le nombre de tâches qui la portent.

- **Suggérer des étiquettes**, affiché tant qu’un projet n’a pas d’étiquette, demande à votre second de lire les tâches du projet et de répondre par une carte d’étiquettes suggérées, que vous modifiez en répondant.
- **Ajouter une étiquette** demande le nom de l’étiquette et quelles tâches y entrent.
- **Modifier** change le nom ou la description d’une étiquette.
  Une étiquette renommée reste sur les tâches qui la portent.
- **Retirer** enlève l’étiquette de toutes les tâches qui la portent, après une question qui dit combien il y en a.

Vous pouvez aussi demander à votre second d’ajouter, de modifier ou de retirer les étiquettes d’un projet.
Une tâche qui passe dans un autre projet perd ses étiquettes, sauf si son projet tout entier a rejoint l’autre.
Pour étiqueter une tâche et retrouver des tâches par étiquette, voir [Tâches et équipiers](/fr/tasks-and-crewmates/#tags).

## Copies de travail {#working-copies}

Votre équipage ne travaille jamais directement dans le dossier de votre projet.
Chaque équipier travaille dans sa propre copie de travail de votre projet, sur sa propre branche.
Vos fichiers restent tels quels jusqu’à ce que vous fusionniez un changement.

## Se concentrer sur un projet {#focus-on-one-project}

À partir de deux projets, la barre du haut affiche une pastille de projet.
Appuyez dessus, ou appuyez sur ⇧⌘P (Ctrl+Shift+P sous Linux et Windows), pour ouvrir une rangée de vos projets.
Chaque pastille compte les tâches qui vous attendent et les tâches en cours.
Choisissez un projet pour y concentrer la fenêtre.

Tant qu’un projet a le focus :

- Le panneau Tâches et le tableau des tâches n’affichent que les tâches de ce projet.
- Activité n’affiche que les lignes sur ce projet, et les lignes qui ne concernent aucune tâche.
- Les cartes sur d’autres projets attendent que le focus change.
  Rien n’est fermé, et chaque projet envoie toujours des notifications.
- Une courte ligne à côté de la pastille indique combien de tâches vous attendent ailleurs, comme « 2 en attente ailleurs ».
- Votre second connaît le focus à chaque message que vous envoyez.
  Sauf si vous nommez un autre projet, il place le nouveau travail dans ce projet, et ses réponses et ses actions sur de nombreuses tâches ne couvrent que ce projet et disent ce qu'elles ont laissé de côté.

Pour voir où tourne le travail d’un projet sans vous concentrer dessus, pointez un équipier au centre de la fenêtre, ou touchez-le sur votre téléphone.
Tant que son résumé est ouvert, chaque équipier d’un autre projet garde un quart de sa lumière, sur chaque ordinateur, et personne ne bouge.
Fermez le résumé et la lumière revient.

Appuyez sur le **×** à côté de la pastille (**Afficher tous les projets**), ou choisissez **Tous les projets** dans la rangée, pour tout revoir.
Infinitary se souvient de votre focus quand vous le redémarrez.

## Comment les changements arrivent dans votre projet {#how-changes-reach-your-project}

Ouvrez un projet dans **Réglages → Projets** pour choisir comment son travail terminé est fusionné.
**Où vont les modifications** propose :

- **demandes de tirage** : chaque changement est proposé en demande de tirage sur GitHub, GitLab ou Bitbucket.
- **demandes de tirage groupées** : vos changements approuvés sont réunis en une seule demande de tirage groupée, un commit pour chaque changement, et fusionnés une fois ses vérifications réussies.
- **fusion locale** : le changement est fusionné dans le projet sur cet ordinateur, sans demande de tirage.

Un projet qui n’existe que sur cet ordinateur ne propose que **fusion locale**.

Quand un changement est prêt, son équipier vous apporte une carte de fusion.
Le bouton de la carte dit ce qu’il fait, comme **Fusionner la demande de tirage**, **Fusionner la branche** ou **Fusionner dans le prochain lot**.
Si les vérifications sont encore en cours, le bouton indique **Fusionner une fois les vérifications réussies**, et Infinitary fusionne dès qu’elles réussissent.

**Demander avant de fusionner** décide qui fusionne.
Il est activé pour un nouveau projet, si bien que le travail terminé attend votre feu vert.
Désactivez-le, et le travail qui réussit les vérifications peut fusionner sans vous demander.

**Soin** règle le degré de vérification du travail : **Rapide**, **Par défaut** ou **Minutieux**.

**Workflows indicatifs** nomme les fichiers de workflow d’un projet GitHub, comme `.github/workflows/early-tests.yml`, dont les vérifications s’affichent sur chaque modification, mais ne retiennent jamais sa fusion ni son lot.
Saisissez les fichiers séparés par des virgules, puis appuyez sur **Enregistrer**.
Une vérification qu’exigent vos règles de branche sur GitHub retient toujours la fusion sur GitHub.

**Signaler l’aide de l’IA** est activé pour un projet dont les changements passent par des demandes de tirage.
Quand un équipier relit la demande de tirage d’une autre personne, le commentaire qu’il publie commence par une ligne qui dit qu’un équipier d’Infinitary l’a écrit.
Modifiez la ligne et appuyez sur **Enregistrer**, ou désactivez l’interrupteur pour ne pas l’ajouter.

## Retirer un projet {#remove-a-project}

1. Ouvrez le projet dans **Réglages → Projets**.
2. Appuyez sur **Retirer** sur sa dernière ligne.
3. Appuyez de nouveau sur **Retirer** pour confirmer.

Retirer un projet l’enlève de la liste.
Son dossier et ses tâches terminées restent.
Si vous l’ajoutez de nouveau, Infinitary utilise le dossier qu’il a laissé dans votre dossier de projets au lieu de cloner une deuxième copie, et le projet repart avec les réglages par défaut.
Si le projet a encore des tâches, Infinitary les nomme, et vous les terminez ou les écartez d’abord.

Dans un projet à plusieurs dépôts, **Retirer** enlève le dépôt dont l’onglet est choisi, et le projet garde les autres.

## Pour la suite {#next}

- [Tâches et équipiers](/fr/tasks-and-crewmates/)
- [Cartes et décisions](/fr/cards-and-decisions/)
