import {
  Cause,
  Config,
  Context,
  Data,
  Effect,
  Exit,
  FiberSet,
  Layer,
  Predicate,
  Scope,
  Secret,
} from "effect"
import * as Tg from "telegraf"
import type * as Types from "telegraf/types"

export interface Options {
  readonly token: Secret.Secret
  readonly client?: Partial<Tg.Telegraf.Options<Tg.Context<Types.Update>>>
  readonly launch?: Tg.Telegraf.LaunchOptions
}

export class TelegrafOptions extends Context.Tag("TelegrafOptions")<
  TelegrafOptions,
  Options
>() {
  static layer(config: Options) {
    return Layer.succeed(this, config)
  }

  static layerConfig(config: Config.Config.Wrap<Options>) {
    return Layer.effect(this, Config.unwrap(config))
  }
}

const make = Effect.gen(function* (_) {
  const config = yield* _(TelegrafOptions)
  return new Tg.Telegraf(Secret.value(config.token), config.client)
})

export class Telegraf extends Context.Tag("Telegraf")<
  Telegraf,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.effect(this, make)

  static Launch = Layer.scopedDiscard(
    Effect.gen(function* (_) {
      const config = yield* _(TelegrafOptions)
      const client = yield* _(Telegraf)
      yield* _(
        Effect.acquireRelease(
          Effect.async<void>(resume => {
            if (config.launch) {
              client.launch(config.launch, () => resume(Effect.unit))
            } else {
              client.launch(() => resume(Effect.unit))
            }
          }),
          () => Effect.sync(() => client.stop()),
        ),
      )
    }),
  ).pipe(Layer.provide(Telegraf.Live))
}

export class TelegrafError extends Data.TaggedError("TelegrafError")<{
  readonly reason: Error
}> {
  get message() {
    return this.reason.message
  }
}

export class TelegrafContext extends Context.Tag("TelegrafContext")<
  TelegrafContext,
  Tg.Context<Types.Update>
>() {
  static run<A>(f: (ctx: Tg.Context<Types.Update>) => Promise<A>) {
    return Effect.flatMap(TelegrafContext, ctx =>
      Effect.tryPromise({
        try: () => f(ctx),
        catch: error => new TelegrafError({ reason: error as Error }),
      }),
    )
  }
}

export const attach = <Ctx extends Types.Update, A, E, R>(
  filter: Predicate.Refinement<Types.Update, Ctx>,
  f: (
    ctx: Tg.NarrowedContext<Tg.Context<Types.Update>, Ctx>,
  ) => Effect.Effect<A, E, R>,
): Effect.Effect<
  void,
  never,
  Telegraf | Scope.Scope | Exclude<R, TelegrafContext>
> =>
  Effect.gen(function* (_) {
    const client = yield* _(Telegraf)
    const runFork = yield* _(
      FiberSet.makeRuntime<Exclude<R, TelegrafContext>>(),
    )
    client.on(
      filter,
      ctx =>
        new Promise<A>((resolve, reject) => {
          const fiber = runFork(
            Effect.provideService(f(ctx), TelegrafContext, ctx as any),
          )
          fiber.addObserver(exit => {
            if (Exit.isSuccess(exit)) {
              resolve(exit.value)
            } else {
              reject(Cause.pretty(exit.cause))
            }
          })
        }),
    )
  })
