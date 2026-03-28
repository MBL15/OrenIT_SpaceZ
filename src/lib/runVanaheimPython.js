/**
 * Pyodide загружается с jsDelivr (браузер, без Node-зависимостей из npm-пакета).
 */
const PYODIDE_VERSION = '0.26.4'
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodidePromise = null

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Не удалось загрузить ${src}`))
    document.head.appendChild(s)
  })
}

export function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      if (typeof window.loadPyodide !== 'function') {
        await loadScript(`${PYODIDE_BASE}pyodide.js`)
      }
      if (typeof window.loadPyodide !== 'function') {
        throw new Error('Pyodide не доступен после загрузки скрипта')
      }
      return window.loadPyodide({ indexURL: PYODIDE_BASE })
    })()
  }
  return pyodidePromise
}

function normalizeOutput(s) {
  if (s == null || s === undefined) return ''
  return String(s).trim().replace(/\r\n/g, '\n')
}

/**
 * @param {*} pyodide
 * @param {string} code
 * @param {string} stdin
 */
async function runPythonOnce(pyodide, code, stdin) {
  const trimmed = code.trim()
  pyodide.globals.set('USER_CODE', trimmed)
  let stdinData = stdin
  if (!stdinData.endsWith('\n')) stdinData += '\n'
  pyodide.globals.set('STDIN_DATA', stdinData)
  await pyodide.runPythonAsync(`
import io, sys
_stdin = STDIN_DATA
sys.stdin = io.StringIO(_stdin)
sys.stdout = io.StringIO()
exec(compile(USER_CODE, '<user>', 'exec'), {'__name__': '__main__'})
OUT = sys.stdout.getvalue()
`)
  return pyodide.globals.get('OUT')
}

/**
 * Вывод эталонной программы (для подсказки в таблице тестов).
 * @param {string} referenceCode
 * @param {string} stdin
 */
export async function getReferenceStdout(referenceCode, stdin) {
  const pyodide = await getPyodide()
  return runPythonOnce(pyodide, referenceCode, stdin)
}

/**
 * Полный вывод эталона для переданных тестов (например, только публичных).
 * @param {string} referenceCode
 * @param {{ stdin: string }[]} tests
 */
export async function getReferenceOutputsForTests(referenceCode, tests) {
  const pyodide = await getPyodide()
  const refTrim = (referenceCode || '').trim()
  if (!refTrim) return tests.map(() => '')
  const outs = []
  for (let i = 0; i < tests.length; i++) {
    outs.push(await runPythonOnce(pyodide, refTrim, tests[i].stdin))
  }
  return outs
}

/**
 * Запускает код ученика на каждом stdin; возвращает массив stdout (для проверки на сервере).
 * @param {string} userCode
 * @param {string[]} stdins
 */
export async function collectStudentStdouts(userCode, stdins) {
  const pyodide = await getPyodide()
  const outs = []
  for (let i = 0; i < stdins.length; i++) {
    outs.push(normalizeOutput(await runPythonOnce(pyodide, userCode, stdins[i])))
  }
  return outs
}

/**
 * Запускает программу ученика; эталон — stdout образцовой программы с тем же stdin.
 * Сравнение только по выводу (stdout). Для скрытых тестов детали эталона в ответ не включаются.
 * @param {string} userCode
 * @param {{ stdin: string, public?: boolean }[]} tests
 * @param {string} referenceCode — тот же код, что в методичке (с input(...)-приглашениями).
 */
export async function runPythonIOTests(userCode, tests, referenceCode) {
  const pyodide = await getPyodide()
  const results = []
  const trimmed = userCode.trim()
  const refTrim = (referenceCode || '').trim()
  if (!trimmed) {
    return tests.map((_, i) => ({
      ok: false,
      testIndex: i,
      public: tests[i]?.public === true,
      expected: undefined,
      actual: undefined,
      error: 'Напишите код в редакторе.',
    }))
  }
  if (!refTrim) {
    return tests.map((_, i) => ({
      ok: false,
      testIndex: i,
      public: tests[i]?.public === true,
      expected: undefined,
      actual: undefined,
      error: 'Для задачи не задан эталонный код.',
    }))
  }

  for (let i = 0; i < tests.length; i++) {
    const { stdin } = tests[i]
    const isPublic = tests[i].public === true
    try {
      const expected = await runPythonOnce(pyodide, refTrim, stdin)
      const actual = await runPythonOnce(pyodide, trimmed, stdin)
      const ok = normalizeOutput(actual) === normalizeOutput(expected)
      const detailErr = `Ожидалось (как у образцовой программы):\n${normalizeOutput(expected)}\n\nПолучено:\n${normalizeOutput(actual)}`
      results.push({
        ok,
        testIndex: i,
        public: isPublic,
        expected: isPublic ? expected : undefined,
        actual: isPublic ? actual : undefined,
        error: ok
          ? undefined
          : isPublic
            ? detailErr
            : 'Скрытый тест не пройден: вывод не совпадает с эталоном.',
      })
    } catch (e) {
      const msg =
        typeof e?.message === 'string'
          ? e.message
          : typeof e === 'string'
            ? e
            : 'Ошибка выполнения'
      results.push({
        ok: false,
        testIndex: i,
        public: isPublic,
        expected: undefined,
        actual: undefined,
        error: isPublic ? msg : 'Скрытый тест: ошибка выполнения.',
      })
    }
  }
  return results
}
