interface LastOpenedInfo {
  id: string;
  wasRead: boolean;
}

let _info: LastOpenedInfo | null = null;

export function setLastOpenedArticle(id: string, wasRead: boolean): void {
  _info = { id, wasRead };
}

export function consumeLastOpenedArticle(): LastOpenedInfo | null {
  const info = _info;
  _info = null;
  return info;
}
