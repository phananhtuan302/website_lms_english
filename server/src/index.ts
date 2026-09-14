import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { APP_NAME, HEALTH_CHECK_PATH, type HealthCheckResponse } from '@platform/shared';
import { loadEnv } from './config/env';

// Validates required env vars (DATABASE_URL, JWT_SECRET) and exits with a clear
// message if any are missing, before anything else in the app starts (T-003).
const env = loadEnv();

const PORT = env.PORT;
const CLIENT_ORIGIN = env.CLIENT_ORIGIN;

const app = express();

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Minimal health-check endpoint. Path + response shape come from /shared so the client can
// import the exact same contract instead of hardcoding it a second time.
app.get(HEALTH_CHECK_PATH, (_req, res) => {
  const body: HealthCheckResponse = {
    status: 'ok',
    service: APP_NAME,
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(body);
});

// Socket.IO is attached to the same underlying HTTP server as Express (not a separate port).
// No events are wired up yet — this is the T-001 scaffold; realtime features land in T-015+.
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on('connection', (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[socket.io] client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[${APP_NAME}] server listening on http://localhost:${PORT}`);
  console.log(`[${APP_NAME}] health check: http://localhost:${PORT}${HEALTH_CHECK_PATH}`);
});
