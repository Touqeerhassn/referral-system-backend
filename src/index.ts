import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { sql } from 'drizzle-orm';
import { db } from './db';
import apiRouter from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initWhatsApp } from './services/whatsapp.service';

const app = express();
const port = process.env.PORT || 5000;

// Global Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', async (_req, res) => {
    try {
        await db.execute(sql`SELECT 1`);
        res.json({ success: true, status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('DB health check failed:', err);
        res.status(500).json({ success: false, status: 'error', database: 'disconnected' });
    }
});

// API Routes
app.use('/api', apiRouter);

// Global Error Handler (must be last)
app.use(errorHandler);

// Start Server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`   Health: http://localhost:${port}/health`);
    console.log(`   API:    http://localhost:${port}/api`);

    // Initialize WhatsApp Web.js client unless explicitly disabled
    if (process.env.DISABLE_WHATSAPP_BOT !== 'true') {
        initWhatsApp();
    }
});
