/**
 * Safe API request helper to prevent unexpected JSON parsing errors
 * (such as "Unexpected token 'T', 'The page c'... is not valid JSON")
 * when calling server-side / Vercel Serverless Function APIs.
 */

export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function safeApiPost<T = any>(
  url: string,
  bodyData: any,
  endpointLabel: string = 'API'
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
    });

    const contentType = res.headers.get('content-type') || '';

    // If response is not JSON (e.g. Vercel 404 HTML page, Cloud Run 502 HTML, or Vite SPA fallback)
    if (!contentType.includes('application/json')) {
      const rawText = await res.text();
      let hint = '';

      if (res.status === 404) {
        hint = '（API 端點不存在 404：若在 Vercel 上請確認 vercel.json rewrites 與 api/ 目錄部署）';
      } else if (res.status === 500) {
        hint = '（伺服器發生內部錯誤 500：請檢查 Vercel Function Logs 或 SUPABASE_SERVICE_ROLE_KEY 設定）';
      } else if (res.status === 502 || res.status === 504) {
        hint = '（閘道逾時或無回應）';
      } else if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
        hint = '（伺服器回傳了 HTML 網頁而非 JSON API 回應，可能被前端 SPA 路由攔截）';
      }

      const snippet = rawText.slice(0, 120).replace(/\s+/g, ' ').trim();
      const message = `${endpointLabel} 呼叫失敗 (HTTP ${res.status})${hint}。伺服器回應摘錄: "${snippet || '無內容'}"`;

      return {
        ok: false,
        status: res.status,
        error: message,
      };
    }

    let parsedJson: any;
    try {
      parsedJson = await res.json();
    } catch (parseErr: any) {
      return {
        ok: false,
        status: res.status,
        error: `${endpointLabel} 回傳了無效的 JSON 格式: ${parseErr.message || String(parseErr)}`,
      };
    }

    if (!res.ok) {
      const errorMsg =
        parsedJson?.error ||
        parsedJson?.message ||
        `${endpointLabel} 執行失敗 (HTTP ${res.status})`;
      return {
        ok: false,
        status: res.status,
        data: parsedJson,
        error: errorMsg,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsedJson,
    };
  } catch (networkErr: any) {
    console.error(`[safeApiPost] Network failure calling ${url}:`, networkErr);
    return {
      ok: false,
      status: 0,
      error: `無法連線至 ${endpointLabel} (${url})：${networkErr.message || '網路連線失敗或被阻擋'}`,
    };
  }
}
