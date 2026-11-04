# SAT Study

Mistake book (screenshot OCR) + Bluebook-style practice + vocab flashcards.

**Live:** https://leowang142857.github.io/sat-study/

Data stays in each browser's IndexedDB — same link, different computers = separate wrong answers.

Local: `npm install && npm run dev` (or `start-sat-study.bat` / `启动 SAT Study.command`)

Practice sets (题集): 「导入题集」 takes a JSON file or a PDF. PDFs are read in the browser with pdf.js; nothing is uploaded. The parser (`src/pdfParse.ts`) looks for numbered questions (`1.` / `Question 1`), A–D choices (`A)` / `(A)` / `A.`), and answers written after each question (`Answer: B`) or in an answer key at the end (`Answer Key` + `1. B 2. C`). Questions without an answer are skipped. Scanned PDFs fall back to OCR (first 30 pages). Limits: two-column layouts come out interleaved, and charts, tables and underlines are lost. Check the preview before importing.

Language: 中文 / English in the header. The choice is saved in this browser and applies to the same build on GitHub Pages and locally. Question text you imported is left as-is.
