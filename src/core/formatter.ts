/**
 * 数据格式化处理模块
 */

import { HighlightsResponse, ThoughtsResponse } from "../config/types";
import { WeReadClient } from "../api/weread/client";
import { getSyncState } from "../utils/file";
import { getBookProgress } from "../api/weread/services";

/**
 * 获取并格式化书籍的划线数据
 */
export async function getBookHighlightsFormatted(
  cookie: string,
  bookId: string,
  useIncremental: boolean = true
): Promise<HighlightsResponse> {
  console.log(`\n获取书籍(ID: ${bookId})的划线数据...`);

  const wereadClient = new WeReadClient(cookie);
  return await wereadClient.getHighlights(bookId, useIncremental);
}

/**
 * 获取并格式化书籍的想法数据
 */
export async function getBookThoughtsFormatted(
  cookie: string,
  bookId: string,
  useIncremental: boolean = true
): Promise<ThoughtsResponse> {
  console.log(`\n获取书籍(ID: ${bookId})的想法数据...`);

  const wereadClient = new WeReadClient(cookie);
  return await wereadClient.getThoughts(bookId, useIncremental);
}

/**
 * 增强书籍元数据
 * 合并从书架和笔记本获取的书籍数据
 */
export async function enhanceBookMetadata(
  cookie: string,
  shelfBooks: any[],
  notebookBooks: any[]
): Promise<any[]> {
  // 创建书籍映射表，以bookId为键
  const bookMap = new Map();

  // 首先添加书架中的书籍
  for (const book of shelfBooks) {
    bookMap.set(book.bookId, {
      ...book,
      source: ["shelf"],
      // 保留旧的状态字段，但后续会被更新
      finishReadingStatus: book.finishReading ? "已读完" : "未读完",
    });
  }

  // 然后添加或合并笔记本中的书籍数据
  for (const nbBook of notebookBooks) {
    const bookId = nbBook.bookId;

    if (bookMap.has(bookId)) {
      // 如果书架中已有该书，合并数据
      const existingBook = bookMap.get(bookId);
      bookMap.set(bookId, {
        ...existingBook,
        ...nbBook.book, // 笔记本中的book对象包含更详细的书籍信息
        hasHighlights: true,
        highlightCount: nbBook.marksCount || 0,
        source: [...existingBook.source, "notebook"],
      });
    } else {
      // 如果书架中没有，直接添加
      bookMap.set(bookId, {
        ...nbBook.book,
        bookId: nbBook.bookId,
        hasHighlights: true,
        highlightCount: nbBook.marksCount || 0,
        source: ["notebook"],
        finishReadingStatus: "未读完", // 默认为未读完
      });
    }
  }
  
  // 转换为数组
  const mergedBooks = Array.from(bookMap.values());
  console.log(`初步合并后共有 ${mergedBooks.length} 本书`);
  
  // 获取每本书的阅读进度信息
  console.log("\n正在获取阅读进度信息...");
  for (let i = 0; i < mergedBooks.length; i++) {
    const book = mergedBooks[i];
    console.log(`[${i + 1}/${mergedBooks.length}] 获取《${book.title}》的阅读进度...`);
    
    // 获取阅读进度
    try {
      const progressInfo = await getBookProgress(cookie, book.bookId);
      
      if (progressInfo && progressInfo.book) {
        // 使用阅读进度API的信息更新书籍状态（用于后续过滤）
        const progress = progressInfo.book.progress || 0;
        const isStarted = progressInfo.book.isStartReading === 1;
        const isFinished = progress >= 100;

        if (isFinished) {
          book.finishReadingStatus = "✅已读";
        } else if (isStarted) {
          book.finishReadingStatus = "📖在读";
          book.progress = progress;
        } else {
          book.finishReadingStatus = "📕未读";
        }

        // 保存额外的阅读信息以便后续扩展功能（Notion 写入使用）
        book.progressData = {
          progress: progress,
          isStartReading: isStarted,
          readingTime: progressInfo.book.readingTime,
          startReadingTime: progressInfo.book.startReadingTime,
          finishTime: progressInfo.book.finishTime,
          updateTime: progressInfo.book.updateTime,
          summary: progressInfo.book.summary,
          chapterUid: progressInfo.book.chapterUid,
          chapterIdx: progressInfo.book.chapterIdx,
          chapterOffset: progressInfo.book.chapterOffset,
        };
      }
    } catch (error: any) {
      console.error(`获取《${book.title}》阅读进度失败: ${error.message}`);
      // 如果获取失败，使用默认的状态
    }
  }
  
  console.log(`共处理 ${mergedBooks.length} 本书的阅读进度信息`);


  return mergedBooks;
}
