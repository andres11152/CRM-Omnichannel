import express from 'express';

const router = express.Router();

// Placeholder para la funcionalidad de Colas/Queues
router.route('/').get((req, res) => res.status(200).json({ message: 'GET /queues not implemented' }));

export default router;