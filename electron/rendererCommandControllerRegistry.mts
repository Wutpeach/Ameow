import type { AmeowRendererCommand } from "../src/types/electronBridge.js";

export type RendererCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type RendererCommandControllerGetter = () => RendererCommandController;

export type RendererCommandControllerDispatchResult<TResult> =
  | { handled: true; value: TResult }
  | { handled: false };

export async function dispatchRendererCommandToControllers<TResult>(
  controllerGetters: readonly RendererCommandControllerGetter[],
  command: AmeowRendererCommand,
  payload?: Record<string, unknown>,
): Promise<RendererCommandControllerDispatchResult<TResult>> {
  for (const getController of controllerGetters) {
    const controller = getController();
    if (controller.supports(command)) {
      return {
        handled: true,
        value: await controller.invoke<TResult>(command, payload),
      };
    }
  }

  return { handled: false };
}
