export class InvalidCommandPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommandPlanError";
  }
}
