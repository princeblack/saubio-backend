/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'body-parser';
import type { IncomingMessage } from 'http';
import { AppModule } from './app/app.module';

type RawBodyRequest = IncomingMessage & { rawBody?: Buffer };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    })
  );
  app.enableCors({ origin: true, credentials: true });
  app.use(
    json({
      limit: '6mb',
      verify: (req: RawBodyRequest, _res, buf, _encoding) => {
        if (Buffer.isBuffer(buf)) {
          req.rawBody = Buffer.from(buf);
        }
      },
    })
  );
  app.use(
    urlencoded({
      extended: true,
      limit: '6mb',
      verify: (req: RawBodyRequest, _res, buf, _encoding) => {
        if (Buffer.isBuffer(buf)) {
          req.rawBody = Buffer.from(buf);
        }
      },
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Saubio API')
    .setDescription('Support, notifications, and profile endpoints for the Saubio platform.')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Saubio API Docs',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}

bootstrap();
