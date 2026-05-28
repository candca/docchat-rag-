// 全项目共享的领域类型
// 任何组件需要 Citation / Message / Document 时统一从这里 import,
// 不要在组件文件内重复定义,以免出现"几份长得不一样的同名类型"。

/** 一条引用来源,对应消息正文里的 [N] 标记 */
export interface Citation {
  /** 引用编号,对应消息文本中 [1][2][3] 的数字,从 1 开始 */
  index: number;
  /** 来源文档名 */
  docName: string;
  /** 后端 document_id，可用于直接定位文档 */
  documentId?: string;
  /** 对应页码(可选,某些非分页文档没有) */
  page?: number;
  /** 原文片段(可选,用于右栏 citation-panel 显示与高亮) */
  snippet?: string;
}

/** 一条聊天消息(用户或助手) */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 仅 assistant 消息会带,user 消息留空 */
  citations?: Citation[];
  timestamp: number;
}

/** 一段可持久化的聊天会话 */
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface DocumentSummary {
  one_sentence: string;
  detailed: string;
  section_summaries: Array<{ title: string; summary: string }>;
  keywords: string[];
  outline: string[];
  summary_origin?: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 左栏文档列表中的一项 */
export interface Document {
  /** 对应后端 document_id */
  id: string;
  /** 对应后端 filename */
  name: string;
  knowledgeBaseId: string;
  /** 从文件名后缀派生 */
  type: "pdf" | "docx" | "md";
  /** 后端无中间态：要么 ready 要么 error */
  status: "ready" | "indexing" | "error";
  /** 上传时间戳(ms，用拉取时间近似) */
  uploadedAt: number;
  /** 文件大小(bytes),可选 */
  size?: number;
  /** 上传后自动生成的文档摘要 */
  summary?: DocumentSummary | null;
}
