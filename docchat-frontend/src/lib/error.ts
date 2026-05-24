export function formatErrorDetail(value: unknown, fallback = "请求失败"): string {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const messages = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "";
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join("；") : fallback;
  }
  if (typeof value === "object" && "message" in value) {
    return String((value as { message: unknown }).message);
  }
  return fallback;
}

export function formatRequestError(error: unknown, fallback = "请求失败"): string {
  const maybeAxios = error as { response?: { data?: { detail?: unknown } } };
  return formatErrorDetail(maybeAxios.response?.data?.detail, fallback);
}
