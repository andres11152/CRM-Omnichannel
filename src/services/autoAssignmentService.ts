import { prisma } from "@/config/prisma";

export const assignTicketToAgent = async (
  ticketId: string,
  queueId: string
) => {
  try {
    // 1. Obtener configuración de la cola y sus agentes
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: {
        agents: {
          // Idealmente filtraríamos por estado aquí si estuviera persistido
          // where: { status: 'ONLINE' }
        },
      },
    });

    if (!queue || queue.type !== "ROUND_ROBIN") {
      console.log(
        `[AutoAssign] Queue ${queueId} is not ROUND_ROBIN or not found.`
      );
      return;
    }

    if (queue.agents.length === 0) {
      console.log(`[AutoAssign] No agents in queue ${queue.name}`);
      return;
    }

    // 2. Algoritmo Round Robin Simple (o Load Balancing)
    // Buscamos el agente con MENOS tickets asignados actualmente (Load Balancing)
    // O podríamos usar un puntero de "último asignado" para Round Robin puro.
    // Usaremos Load Balancing por ser más robusto sin estado extra.

    // Obtenemos la carga actual de cada agente en esta cola
    const agentsLoad = await Promise.all(
      queue.agents.map(async (agent) => {
        const activeTickets = await prisma.ticket.count({
          where: {
            assignedToId: agent.id,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });
        return { agentId: agent.id, load: activeTickets, name: agent.name };
      })
    );

    // Ordenar por carga ascendente
    agentsLoad.sort((a, b) => a.load - b.load);

    // Seleccionar el candidato (el de menos carga)
    // TODO: Aquí deberíamos verificar si está ONLINE.
    // Como no tenemos Redis a mano, asumiremos que si está en la cola es elegible,
    // o podríamos agregar un campo 'isOnline' en User si decidimos persistirlo.
    const candidate = agentsLoad[0];

    if (candidate) {
      console.log(
        `[AutoAssign] Assigning ticket ${ticketId} to ${candidate.name} (Load: ${candidate.load})`
      );

      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          assignedToId: candidate.agentId,
          status: "IN_PROGRESS", // Opcional: cambiar estado automáticamente
        },
      });
    }
  } catch (error) {
    console.error("[AutoAssign] Error assigning ticket:", error);
  }
};
