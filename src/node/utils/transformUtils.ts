export async function asyncReplace(
  input: string,
  re: RegExp,
  replacer: (match: RegExpExecArray) => string | Promise<string>
) {
  let match: RegExpExecArray | null
  let remaining = input
  let rewritten = ''
  while ((match = re.exec(remaining))) {
    rewritten += remaining.slice(0, match.index)
    rewritten += await replacer(match)
    remaining = remaining.slice(match.index + match[0].length)
  }
  rewritten += remaining
  return rewritten
}

const injectReplaceRE = [/<head>/, /<!doctype html>/i]

export function injectScriptToHtml(html: string, script: string) {
  // inject after head or doctype
  for (const re of injectReplaceRE) {
    if (re.test(html)) {
      return html.replace(re, `$&${script}`)
    }
  }
  // if no <head> tag or doctype is present, just prepend
  return script + html
}
