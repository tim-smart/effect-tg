import { runMain } from "@effect/platform-node/NodeRuntime"
import { Config, Effect, Layer } from "effect"
import { message } from "telegraf/filters"
import { Telegraf, TelegrafContext, TelegrafOptions, attach } from "./Telegraf"

const MessageHandlerLive = Layer.scopedDiscard(
  attach(message("text"), _ => Effect.log(`Got message: ${_.message.text}`)),
).pipe(Layer.provide(Telegraf.Live))

const party = TelegrafContext.run(_ => _.react("🎉"))

const ReacterLive = Layer.scopedDiscard(
  attach(message("text"), _ => party),
).pipe(Layer.provide(Telegraf.Live))

const MainLive = Telegraf.Launch.pipe(
  Layer.provide(MessageHandlerLive),
  Layer.provide(ReacterLive),
  Layer.provide(
    TelegrafOptions.layerConfig({
      token: Config.secret("TELEGRAM_BOT_TOKEN"),
    }),
  ),
)

runMain(Layer.launch(MainLive))
