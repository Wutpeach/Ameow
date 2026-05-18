import {
  DownloadRuntimeError,
  type DownloadEngine,
  type DownloadIntent,
  type EngineExecutionContext,
  type EnginePlan,
} from "../core/index.js";
import { runDouyinDlDownload } from "../electron-runtime/douyinDlDownload.js";

export class DouyinDlEngine implements DownloadEngine {
  readonly id = "douyin-dl" as const;

  validateIntent(intent: DownloadIntent, plan: EnginePlan) {
    const sourceUrl = plan.sourceUrl ?? intent.pageUrl ?? intent.originalUrl;
    if (!sourceUrl) {
      return new DownloadRuntimeError(
        "E_INVALID_ENGINE_PLAN",
        "douyin-dl requires a source URL",
        {
          context: { siteId: intent.siteId, plan },
        },
      );
    }
    return null;
  }

  async execute(context: EngineExecutionContext) {
    return await runDouyinDlDownload(context);
  }
}
