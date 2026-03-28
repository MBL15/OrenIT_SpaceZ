/**
 * Урок «Ванахейм»: ввод/вывод. Автопроверка сравнивает stdout ученика с stdout
 * образцовой программы из методички (тот же stdin).
 */

/** Образцовый код для Pyodide (без f-строк с ${}, чтобы не конфликтовать с шаблонами JS). */
export const VANAHEIM_REFERENCE_CODE = {
  task1_yield: [
    '# Задача 1: Урожайность поля',
    'n = int(input("Введите количество участков: "))',
    'rich_count = 0',
    'total_harvest = 0',
    'for i in range(n):',
    '    harvest = int(input("Участок " + str(i + 1) + ", центнеров: "))',
    '    total_harvest += harvest',
    '    if harvest > 30:',
    '        rich_count += 1',
    'print("Богатых участков: " + str(rich_count))',
    'print("Общий урожай: " + str(total_harvest) + " ц")',
  ].join('\n'),

  task2_drought: [
    '# Задача 2: Полив в засуху',
    'N = int(input("Сколько грядок не полито? "))',
    '',
    'while N > 0:',
    '    if N >= 5:',
    '        N -= 5',
    '        print("Осталось", N, "грядок.")',
    '        print("Сегодня поработал на совесть!")',
    '    else:',
    '        N = 0',
    '        print("Осталось 0 грядок.")',
    '        break',
    '',
    'print("Полив завершён!")',
  ].join('\n'),

  task3_ph: [
    '# Задача 3: Выбор удобрения',
    'no_fertilizer_count = 0',
    '',
    'for field in range(1, 4):',
    '    ph = float(input("Введите pH для поля " + str(field) + ": "))',
    '    if ph < 6:',
    '        print("Поле " + str(field) + ": известкование")',
    '    elif ph > 7:',
    '        print("Поле " + str(field) + ": гипсование")',
    '    else:',
    '        print("Поле " + str(field) + ": удобрения не требуются")',
    '        no_fertilizer_count += 1',
    '',
    'print("Полей без удобрений: " + str(no_fertilizer_count))',
  ].join('\n'),

  task4_apples: [
    '# Задача 4: Сбор яблок',
    'rows = int(input("Количество рядов: "))',
    'max_harvest = -1',
    'best_row = 0',
    'for row in range(1, rows + 1):',
    '    trees = int(input("Сколько деревьев в ряду " + str(row) + "? "))',
    '    row_harvest = 0',
    '    for tree in range(1, trees + 1):',
    '        kg = int(input("  Дерево " + str(tree) + ", кг: "))',
    '        row_harvest += kg',
    '    if row_harvest > max_harvest:',
    '        max_harvest = row_harvest',
    '        best_row = row',
    'print("Самый урожайный ряд: " + str(best_row) + ", собрано " + str(max_harvest) + " кг")',
  ].join('\n'),
}

/** Первый тест открытый (показан в таблице), остальные — скрытые. */
function ioTests(stdins) {
  return stdins.map((stdin, i) => ({ stdin, public: i === 0 }))
}

export const VANAHEIM_TOTAL_TESTS_PER_TASK = 5

const TASK1_STDINS = [
  '4\n25\n40\n30\n55',
  '1\n31',
  '2\n10\n20',
  '3\n31\n32\n10',
  '4\n30\n30\n30\n30',
]

const TASK2_STDINS = ['12', '1', '3', '7', '5']

const TASK3_STDINS = [
  '5.5\n7.2\n6.5',
  '6\n6\n6',
  '5\n8\n7.5',
  '4\n9\n6.2',
  '5.9\n7.1\n6.0',
]

/** Ввод как у образца: по одному числу на дерево (вложенные input). */
const TASK4_STDINS = [
  '3\n2\n10\n15\n4\n5\n8\n12\n7\n1\n20',
  '1\n3\n1\n2\n3',
  '2\n1\n5\n2\n10\n20',
  '2\n2\n1\n1\n2\n3\n3',
  '1\n1\n42',
]

/** Тексты примеров (кратко; полный stdout с приглашениями — в таблице после загрузки Pyodide). */
export const VANAHEIM_BOOK_EXAMPLES = {
  task1_yield: {
    stdin: '4\n25\n40\n30\n55',
    stdout: 'Богатых участков: 2\nОбщий урожай: 150 ц\n',
    note: 'В консоли перед этим идут приглашения input() — их вывод должен совпасть с эталоном в таблице тестов.',
  },
  task2_drought: {
    stdin: '12',
    stdout:
      'Осталось 7 грядок.\nСегодня поработал на совесть!\nОсталось 2 грядок.\nСегодня поработал на совесть!\nОсталось 0 грядок.\nПолив завершён!\n',
    note:
      'В образцовой программе везде форма «грядок»; после каждого дня с поливом 5 грядок — строка про «совесть». Сначала в stdout идёт приглашение «Сколько грядок не полито?» — см. колонку эталона в таблице.',
  },
  task3_ph: {
    stdin: '5.5\n7.2\n6.5',
    stdout:
      'Поле 1: известкование\nПоле 2: гипсование\nПоле 3: удобрения не требуются\nПолей без удобрений: 1\n',
    note: 'Перед каждым вводом pH выводится свой prompt — он входит в эталонный stdout.',
  },
  task4_apples: {
    stdin: '3\n2\n10\n15\n4\n5\n8\n12\n7\n1\n20',
    stdout: 'Самый урожайный ряд: 2, собрано 32 кг\n',
    note:
      'Ввод как в методичке: для каждого дерева отдельная строка. Полный вывод с вопросами «Количество рядов», «Сколько деревьев» и т.д. — в колонке эталона.',
  },
}

export const VANAHEIM_TASKS = [
  {
    id: 'task1_yield',
    title: 'Урожайность поля',
    story:
      'Фермер засеял поле пшеницей. Сначала вводится число n — количество участков, затем урожай с каждого участка. Участок «богатый», если собрано больше 30 центнеров.',
    requirements:
      'Автопроверка сравнивает ваш вывод с выводом образцовой программы при тех же данных на входе (включая текст приглашений input(...), если вы их используете — удобнее повторить формулировки из методички). Используйте цикл for и if.',
    referenceCode: VANAHEIM_REFERENCE_CODE.task1_yield,
    bookExample: VANAHEIM_BOOK_EXAMPLES.task1_yield,
    tests: ioTests(TASK1_STDINS),
  },
  {
    id: 'task2_drought',
    title: 'Полив в засуху',
    story:
      'За день можно полить не больше 5 грядок. Вводится одно число — сколько грядок ещё не политы. После каждого дня выведите, сколько осталось. Если за день полили ровно 5 — строка «Сегодня поработал на совесть!». В конце — «Полив завершён!».',
    requirements:
      'Образец в методичке использует while, ветвление if/else и слово «грядок» во всех строках. Вывод должен совпасть с эталоном посимвольно (включая приглашение «Сколько грядок не полито?»).',
    referenceCode: VANAHEIM_REFERENCE_CODE.task2_drought,
    bookExample: VANAHEIM_BOOK_EXAMPLES.task2_drought,
    tests: ioTests(TASK2_STDINS),
  },
  {
    id: 'task3_ph',
    title: 'Выбор удобрения',
    story:
      'Три поля. Для каждого вводится pH. Если pH < 6 — известкование; если pH > 7 — гипсование; иначе удобрения не требуются. В конце — сколько полей без удобрений.',
    requirements:
      'Три поля, три ввода с приглашениями как в образце. Итоговая строка «Полей без удобрений: …».',
    referenceCode: VANAHEIM_REFERENCE_CODE.task3_ph,
    bookExample: VANAHEIM_BOOK_EXAMPLES.task3_ph,
    tests: ioTests(TASK3_STDINS),
  },
  {
    id: 'task4_apples',
    title: 'Сбор яблок',
    story:
      'Несколько рядов яблонь; в каждом ряду несколько деревьев. Сначала число рядов, затем для каждого ряда — число деревьев и отдельно урожай (кг) с каждого дерева.',
    requirements:
      'Вложенные циклы; ввод урожая по одному значению на строку, как в образцовой программе. Итог — одна строка «Самый урожайный ряд: …».',
    referenceCode: VANAHEIM_REFERENCE_CODE.task4_apples,
    bookExample: VANAHEIM_BOOK_EXAMPLES.task4_apples,
    tests: ioTests(TASK4_STDINS),
  },
]
