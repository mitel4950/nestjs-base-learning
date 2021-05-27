import {LoggerMiddleware, LoggingInterceptor, TimeoutInterceptor, ValidationPipe} from '@common';
import {DOMAIN, END_POINT, NODE_ENV, PORT, PRIMARY_COLOR, RATE_LIMIT_MAX, VOYAGER} from '@environments';
import {INestApplication, Logger} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {RolesGuard} from 'auth/guards/roles.guard';
import * as bodyParser from 'body-parser';
import chalk from 'chalk';
import {express as voyagerMiddleware} from 'graphql-voyager/middleware';
import {getConnection} from 'typeorm';
import * as compression from 'compression';
import * as rateLimit from 'express-rate-limit';
import * as helmet from 'helmet';

declare const module: any;

export default async function bootstrap(app: INestApplication) {
  try {
    // NOTE: database connect
    const connection = getConnection('default');
    const {isConnected} = connection;
    isConnected
      ? Logger.log(`🌨️  Database connected`, 'TypeORM', false)
      : Logger.error(`❌  Database connect error`, '', 'TypeORM', false);

    // NOTE: adapter for e2e testing
    const httpAdapter = app.getHttpAdapter();

    // NOTE: compression
    app.use(compression());

    // NOTE: added security
    app.use(helmet());

    // NOTE: body parser
    app.use(bodyParser.json({limit: '50mb'}));
    app.use(
      bodyParser.urlencoded({
        limit: '50mb',
        extended: true,
        parameterLimit: 50000
      })
    );

    // NOTE: rateLimit
    app.use(
      rateLimit({
        windowMs: 1000 * 60, // an hour
        max: RATE_LIMIT_MAX!, // limit each IP to 100 requests per windowMs
        message:
          '⚠️  Too many request created from this IP, please try again after an hour'
      })
    );

    // NOTE:loggerMiddleware
    NODE_ENV !== 'testing' && app.use(LoggerMiddleware);

    // NOTE: voyager
    process.env.NODE_ENV !== 'production' &&
    app.use(
      `/${VOYAGER!}`,
      voyagerMiddleware({
        displayOptions: {
          skipRelay: false,
          skipDeprecated: false
        },
        endpointUrl: `/${END_POINT!}`
      })
    );

    // NOTE: interceptors
    app.useGlobalInterceptors(new LoggingInterceptor());
    app.useGlobalInterceptors(new TimeoutInterceptor());

    // NOTE: global nest setup
    app.useGlobalGuards(new RolesGuard(new Reflector()));
    app.useGlobalPipes(new ValidationPipe());

    app.enableShutdownHooks();

    // NOTE: size limit
    app.use('*', (req, res, next) => {
      const query = req.query.query || req.body.query || '';
      if (query.length > 2000) {
        throw new Error('Query too large');
      }
      next();
    });

    const server = await app.listen(PORT!);

    // NOTE: hot module replacement
    if (module.hot) {
      module.hot.accept();
      module.hot.dispose(() => app.close());
    }

    NODE_ENV !== 'production'
      ? Logger.log(
      `🚀  Server ready at http://${DOMAIN!}:${chalk
        .hex(PRIMARY_COLOR!)
        .bold(`${PORT!}`)}/${END_POINT!}`,
      'Bootstrap',
      false
      )
      : Logger.log(
      `🚀  Server is listening on port ${chalk
        .hex(PRIMARY_COLOR!)
        .bold(`${PORT!}`)}`,
      'Bootstrap',
      false
      );

    NODE_ENV !== 'production' &&
    Logger.log(
      `🚀  Subscriptions ready at ws://${DOMAIN!}:${chalk
        .hex(PRIMARY_COLOR!)
        .bold(`${PORT!}`)}/${END_POINT!}`,
      'Bootstrap',
      false
    );
  } catch (error) {
    Logger.error(`❌  Error starting server, ${error}`, '', 'Bootstrap', false);
    process.exit();
  }
}
