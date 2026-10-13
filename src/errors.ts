/** 面向用户的输入错误（中文），API 返回 { error } + status。 */
export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
