import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

/**
 * 🔌 USE SOCKET HOOK
 * Returns connected Socket.IO instance for real-time events
 */

let socketInstance: Socket | null = null;

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Only create socket if not already exists
    if (!socketInstance) {
      const SOCKET_URL =
        import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");

      if (token) {
        socketInstance = io(SOCKET_URL, {
          auth: { token },
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: Infinity,
        });

        console.log("[useSocket] Socket.IO connected");
      }
    }

    setSocket(socketInstance);

    return () => {
      // Don't disconnect on component unmount (keep alive)
      // Socket will be managed globally
    };
  }, []);

  return socket;
};

// Utility to get socket instance anywhere
export const getSocket = () => socketInstance;
