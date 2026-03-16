# Best-Python-Obfuscator-NGL

Онлайн-обфускатор Python-кода: переименование идентификаторов, шифрование строк (AES), мусорный код, минификация.

- **Сайт:** https://buglivesmatter.github.io/Best-Python-Obfuscator-NGL/

## Запуск локально

```bash
git clone https://github.com/BugLivesMatter/Best-Python-Obfuscator-NGL.git
cd Best-Python-Obfuscator-NGL
npm install
npm run dev
```

Сборка для продакшена: `npm run build`. Артефакты в папке `dist/`.

## Стек

React, TypeScript, Vite, Tailwind CSS. Обфускатор в `src/obfuscator/`.

## Режим hard obfuscation

Внизу интерфейса есть чекбокс **hard obfuscation**:

- включает более агрессивное шифрование строк (несколько схем, рандомизация представления);
- увеличивает плотность и вариативность junk-кода;
- подключает инфраструктуру для будущих структурных преобразований (flattening/VM).

Может замедлять выполнение и усложнять отладку. Для обычного использования достаточно стандартного режима без этого флага.
