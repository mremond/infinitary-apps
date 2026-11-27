---
source: 6f29a4870b425665
title: Proyectos
description: Cómo agregar un proyecto a Infinitary, reunir varios repositorios en uno, darle etiquetas, centrar la ventana en uno, elegir cómo se fusionan sus cambios y quitarlo.
---

Un proyecto es aquello en lo que trabaja tu tripulación: un repositorio, o varios que van juntos, como una app y su servicio.
Un repositorio es una carpeta tuya, gestionada con git.
Cada tarea pertenece a un proyecto, y cada clave de tarea empieza con la clave de su proyecto, como `WEB-12`.
Tus proyectos aparecen en **Configuración → Proyectos**, y presionar la línea de un proyecto abre su página.

## Agregar un proyecto {#add-a-project}

Puedes agregar un proyecto de dos formas.

- **Pídeselo a tu primer oficial.**
  Di en qué proyecto trabajar, por ejemplo «Clona el proyecto en» seguido de su enlace.
  Tu primer oficial te trae una tarjeta que nombra el proyecto y sus ajustes.
  No se agrega nada hasta que presionas **Agregar proyecto** en esa tarjeta.
- **Agrégalo tú mismo.**
  Abre **Configuración → Proyectos** y usa la fila **Agregar proyecto** al pie de la lista.

La fila **Agregar proyecto** tiene tres botones:

1. **Carpeta en esta computadora** agrega una carpeta que ya tienes.
   Si la carpeta todavía no usa git, Infinitary inicia git ahí con una primera confirmación vacía.
2. **Repositorio de GitHub**, **Repositorio de GitLab** o **Repositorio de Bitbucket** clona un proyecto desde donde se aloja.
   Elígelo en **Tus repositorios de GitHub**, usa **Buscar un repositorio** para buscar, o pega su enlace.
   Con muchos repositorios, puede que algunos no se hayan revisado, y la lista lo dice; pega un enlace para agregar uno que falte.
3. **Proyecto nuevo** empieza un proyecto vacío con el nombre que escribas.

Un proyecto clonado o nuevo va a tu carpeta de proyectos.
La línea **Los proyectos nuevos van en** muestra esa carpeta, y **Elegir carpeta** la cambia.
Los proyectos que ya agregaste nunca se mueven cuando la cambias.

**Clave de tareas** es opcional.
Escribe hasta cuatro letras o dígitos, y las tareas del siguiente proyecto se numeran con ella.
Déjala vacía, e Infinitary crea una clave a partir del nombre del proyecto.

Para un proyecto alojado en otro sitio, pídeselo a tu primer oficial.

## Tu inicio de sesión de GitHub, GitLab o Bitbucket {#your-github-gitlab-or-bitbucket-sign-in}

Para clonar un proyecto y ofrecer sus cambios, Infinitary usa tu inicio de sesión de GitHub, GitLab o Bitbucket.

Si no has iniciado sesión cuando presionas **Repositorio de GitHub**, **Repositorio de GitLab** o **Repositorio de Bitbucket**, la fila muestra **Iniciar sesión en GitHub**, **Iniciar sesión en GitLab** o **Iniciar sesión en Bitbucket** en lugar de tus proyectos.
Ese botón abre **Configuración → Integraciones**, donde viven tus inicios de sesión; consulta [Integraciones](/es/integrations/).
Para GitHub, escribes un código en la página de GitHub en tu navegador.
Para GitLab, puedes iniciar sesión en tu navegador o pegar una clave, en gitlab.com o en tu propio servidor de GitLab.
Para Bitbucket, creas un token de API en tu cuenta de Atlassian y lo pegas, para proyectos en bitbucket.org.
El formulario de la clave nombra los permisos que debes marcar en la página de Atlassian.
Para tu propio servidor de Bitbucket Data Center, versión 8.19 o posterior, escribes su dirección y pegas un token de acceso HTTP con los permisos Project read y Repository write.
Los cambios de un proyecto de Data Center se ofrecen como solicitudes de incorporación de cambios, y la fusión se hace solo en la versión que aprobaste: si alguien inserta cambios mientras tanto, no se fusiona nada y la tarea lo dice.
Un proyecto de Data Center también puede elegir solicitudes de incorporación de cambios por lotes, y tu tripulación puede leer y escribir en el servidor, contribuir a través de tu bifurcación y despertar con los comentarios nuevos en su solicitud de incorporación de cambios y con una comprobación fallida en su rama principal.
Un servidor de Data Center no guarda registros de comprobaciones, ejecuciones ni archivos de versión propios: sus comprobaciones vienen de otro servicio, y cada una enlaza a dónde está su registro.
Tus proyectos de Bitbucket se enumeran a partir de los espacios de trabajo a los que perteneces; con muchos, puede que algunos no se hayan revisado, y la lista lo dice.
Los cambios de un proyecto de Bitbucket se ofrecen como solicitudes de incorporación de cambios, igual que en GitHub y GitLab; un proyecto que agregaste antes de esto funciona igual a partir de su próxima tarea.
La descripción de una solicitud de incorporación de cambios de Bitbucket lleva la historia como texto, y sus imágenes se quedan en la tarjeta.
Un proyecto de Bitbucket también puede elegir solicitudes de incorporación de cambios por lotes, y sus fusiones siguen las estrategias y la cola de fusión que su rama principal tiene en bitbucket.org.
En un proyecto de Bitbucket, tu tripulación también puede leer las canalizaciones del proyecto y el registro de un paso, poner un archivo de una versión en sus Descargas y despertarse con los comentarios nuevos en su solicitud de incorporación de cambios, igual que en GitHub y GitLab; Bitbucket no ofrece la descarga de los artefactos de una canalización.
Tu inicio de sesión se queda en esta computadora.

Si un inicio de sesión deja de funcionar, una tarjeta te pide que vuelvas a iniciar sesión.
El trabajo que lo necesita espera hasta que lo hagas.

## Varios repositorios en un proyecto {#several-repositories-in-one-project}

Un proyecto empieza con un repositorio y puede tener más.
Su página los enumera en **Repositorios**, con una pestaña para cada uno.

Puedes agregar un repositorio a un proyecto de dos formas.

- **Pídeselo a tu primer oficial.**
  Di a qué proyecto se une el repositorio.
  Tu primer oficial te trae una tarjeta, y no se agrega nada hasta que presionas **Agregar repositorio** en ella.
- **Agrégalo tú mismo.**
  Presiona **Agregar un repositorio**, después de la última pestaña, y elige una carpeta, un repositorio para clonar o **Nuevo repositorio**, como haces con un proyecto.

Las tareas del repositorio llevan la clave de tareas del proyecto.
Cada tarea trabaja en un solo repositorio, y la pestaña **Info** de la tarea lo nombra junto al proyecto.
Cada repositorio conserva sus propios ajustes, como **Adónde van los cambios**, **Preguntar antes de fusionar** y **Cuidado**: elige su pestaña para cambiarlos.
Un proyecto de varios repositorios tiene un nombre propio, que se cambia con **Nombre** en el recuadro **Proyecto**.

## Mover un repositorio a otro proyecto {#move-a-repository-to-another-project}

Un repositorio puede moverse a otro proyecto, o a un proyecto propio.

- **Pídeselo a tu primer oficial.**
  Cuando le dices exactamente qué mover y adónde, se hace de inmediato.
  Cuando es tu primer oficial quien sugiere un traslado, una tarjeta muestra adónde va cada repositorio y qué tareas lo siguen, y no se mueve nada hasta que presionas **Aplicar traslado**.
- **Muévelo tú mismo.**
  En la pestaña del repositorio, elige un proyecto en la línea que ofrece moverlo a otro proyecto, presiona **Mover** y presiona **Mover** de nuevo para confirmar.

El repositorio conserva su nombre, su carpeta y sus ajustes.
Sus tareas van con él, y cada tarea conserva su clave.
Un proyecto que se queda sin repositorios sale de la lista: el resto de sus tareas, sus etiquetas y sus automatizaciones se unen al otro proyecto, y su clave no vuelve a usarse nunca.
Para combinar dos proyectos, mueve los repositorios de uno al otro.

## Etiquetas {#tags}

Cada proyecto tiene su propia lista de etiquetas, como error, función o idea.
Una etiqueta tiene un nombre y una descripción que dice qué tareas entran.
Las etiquetas te ayudan a encontrar y agrupar tareas, y nada más en Infinitary depende de una etiqueta.

La página de un proyecto enumera sus etiquetas en **Etiquetas**, cada una con el número de tareas que la llevan.

- **Sugerir etiquetas**, que aparece mientras un proyecto no tiene etiquetas, pide a tu primer oficial que lea las tareas del proyecto y responda con una tarjeta de etiquetas sugeridas que puedes cambiar respondiendo.
- **Añadir una etiqueta** pide el nombre de la etiqueta y qué tareas entran.
- **Editar** cambia el nombre o la descripción de una etiqueta.
  Una etiqueta a la que le cambias el nombre sigue en las tareas que la llevan.
- **Quitar** saca la etiqueta de todas las tareas que la llevan, después de una pregunta que dice cuántas son.

También puedes pedirle a tu primer oficial que agregue, cambie o quite las etiquetas de un proyecto.
Una tarea que pasa a otro proyecto pierde sus etiquetas, a menos que todo su proyecto se haya unido a ese.
Para etiquetar una tarea y para encontrar tareas por etiqueta, consulta [Tareas y tripulantes](/es/tasks-and-crewmates/#tags).

## Copias de trabajo {#working-copies}

Tu tripulación nunca trabaja directamente en la carpeta de tu proyecto.
Cada tripulante trabaja en su propia copia de trabajo de tu proyecto, en su propia rama.
Tus archivos se quedan como están hasta que fusionas un cambio.

## Centrarse en un proyecto {#focus-on-one-project}

Con dos proyectos o más, la barra superior muestra una píldora de proyecto.
Presiónala, o presiona ⇧⌘P (Ctrl+Shift+P en Linux y Windows), para abrir una fila con tus proyectos.
Cada píldora cuenta las tareas que te esperan y las tareas que están trabajando.
Elige un proyecto para centrar la ventana en él.

Mientras un proyecto está en el centro:

- El panel Tareas y el tablero de tareas solo muestran las tareas de ese proyecto.
- Actividad solo muestra las líneas sobre ese proyecto, y las líneas que no son de ninguna tarea.
- Las tarjetas de otros proyectos esperan hasta que cambie el centro.
  No se cierra nada, y todos los proyectos siguen enviando notificaciones.
- Una línea corta junto a la píldora dice cuántas tareas te esperan en otros lugares, como «2 esperando en otro lugar».
- Tu primer oficial conoce el enfoque con cada mensaje que envías.
  A menos que nombres otro proyecto, pone el trabajo nuevo en ese proyecto, y sus respuestas y sus acciones sobre muchas tareas cubren solo ese proyecto y dicen lo que dejaron fuera.

Para ver dónde corre el trabajo de un proyecto sin concentrarte en él, apunta a un tripulante en el centro de la ventana, o tócalo en tu teléfono.
Mientras su resumen está abierto, cada tripulante de otro proyecto baja a una cuarta parte de su luz, en cada computadora, y nadie se mueve.
Cierra el resumen y la luz vuelve.

Presiona la **×** junto a la píldora (**Mostrar todos los proyectos**), o elige **Todos los proyectos** en la fila, para volver a ver todo.
Infinitary recuerda tu centro cuando lo reinicias.

## Cómo llegan los cambios a tu proyecto {#how-changes-reach-your-project}

Abre un proyecto en **Configuración → Proyectos** para elegir cómo se fusiona su trabajo terminado.
**Adónde van los cambios** ofrece:

- **solicitudes de incorporación de cambios**: cada cambio se ofrece como una solicitud de incorporación de cambios en GitHub, GitLab o Bitbucket.
- **solicitudes de incorporación de cambios por lotes**: tus cambios aprobados se combinan en una solicitud de incorporación de cambios del lote, con una confirmación por cada cambio, y se fusionan cuando se superan sus comprobaciones.
- **fusión local**: el cambio se fusiona en el proyecto en esta computadora, sin solicitud de incorporación de cambios.

Un proyecto que solo se aloja en esta computadora ofrece solo **fusión local**.

Cuando un cambio está listo, su tripulante te trae una tarjeta de fusión.
El botón de la tarjeta dice lo que hace, como **Fusionar la solicitud de incorporación de cambios**, **Fusionar la rama** o **Fusionar en el próximo lote**.
Si las comprobaciones todavía están en curso, el botón dice **Fusionar cuando se superen las comprobaciones**, e Infinitary fusiona cuando se superen.

**Preguntar antes de fusionar** decide quién fusiona.
Está activado para un proyecto nuevo, así que el trabajo terminado espera tu palabra.
Desactívalo, y el trabajo que supera las comprobaciones puede fusionarse sin preguntarte.

**Cuidado** define con qué minuciosidad se comprueba el trabajo: **Rápido**, **Predeterminado** o **Cuidadoso**.

**Flujos de trabajo orientativos** indica los archivos de flujo de trabajo de un proyecto de GitHub, como `.github/workflows/early-tests.yml`, cuyas comprobaciones aparecen en cada cambio, pero nunca retienen su fusión ni su lote.
Escribe los archivos separados por comas y pulsa **Guardar**.
Una comprobación que exigen tus reglas de rama en GitHub sigue reteniendo la fusión en GitHub.

**Indicar la ayuda de IA** está activado en un proyecto cuyos cambios pasan por solicitudes de incorporación de cambios.
Cuando un tripulante revisa la solicitud de incorporación de cambios de otra persona, el comentario que publica empieza con una línea que dice que lo escribió un tripulante de Infinitary.
Cambia la línea y pulsa **Guardar**, o desactiva el interruptor para no incluirla.

## Quitar un proyecto {#remove-a-project}

1. Abre el proyecto en **Configuración → Proyectos**.
2. Presiona **Quitar** en su última línea.
3. Presiona **Quitar** de nuevo para confirmar.

Quitarlo saca el proyecto de la lista.
Su carpeta y sus tareas terminadas se quedan.
Si lo vuelves a agregar, se usa la carpeta que dejó en tu carpeta de proyectos en lugar de clonar una segunda copia, y el proyecto empieza de nuevo con la configuración predeterminada.
Si el proyecto todavía tiene tareas, Infinitary las nombra, y primero las terminas o las abandonas.

En un proyecto de varios repositorios, **Quitar** saca el repositorio cuya pestaña está elegida, y el proyecto conserva los demás.

## Siguiente {#next}

- [Tareas y tripulantes](/es/tasks-and-crewmates/)
- [Tarjetas y decisiones](/es/cards-and-decisions/)
