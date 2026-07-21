import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft, Ghost } from "lucide-react";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-violet-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-2xl w-full text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Animated Ghost Icon */}
          <motion.div
            animate={{ 
              y: [0, -20, 0],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity,
              ease: "easeInOut" 
            }}
            className="inline-flex items-center justify-center w-32 h-32 bg-indigo-500/10 rounded-3xl mb-8 border border-indigo-500/20"
          >
            <Ghost size={64} className="text-indigo-400" />
          </motion.div>

          <h1 className="text-[120px] font-black text-white leading-none mb-4 tracking-tighter">
            404
          </h1>
          
          <h2 className="text-2xl md:text-3xl font-bold text-gray-200 mb-6">
            Página no encontrada
          </h2>
          
          <p className="text-gray-400 text-lg mb-10 max-w-md mx-auto leading-relaxed">
            Parece que te has aventurado en una zona inexplorada. El recurso que buscas se ha movido o nunca existió.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
            >
              <Home size={20} />
              Volver al Inicio
            </Link>
            
            <button
              onClick={() => window.history.back()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10 transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft size={20} />
              Regresar
            </button>
          </div>
        </motion.div>

        {/* System Info Decor */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-16 pt-8 border-t border-white/5"
        >
          <p className="text-xs text-gray-500 font-mono tracking-widest uppercase">
            Error ID: {Math.random().toString(36).substring(7).toUpperCase()} | Sentry CRM Infrastructure
          </p>
        </motion.div>
      </div>
    </div>
  );
};
