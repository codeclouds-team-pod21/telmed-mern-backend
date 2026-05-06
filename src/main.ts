import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const bodyParser = require('body-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(bodyParser.json({ limit: '35mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '35mb' }));
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  app.setGlobalPrefix('api');
 
  app.getHttpAdapter().getInstance().get('/api/ping', (_req: unknown, res: { send: (arg0: string) => void; }) => {
    res.send('pong');
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3005);
  console.log(`Server is running on port ${process.env.PORT || 3005}`);
}

bootstrap();
