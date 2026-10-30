/** 后台面板共用的异常文案提取；接口错误已是中文 HttpError 消息。 */
export function errorMessage(error, fallback = '操作失败') {
  return error instanceof Error ? error.message : fallback;
}
