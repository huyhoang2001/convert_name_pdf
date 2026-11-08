import { faqs, type ChatLanguage } from './chatbotFaq.ts';
import policy from '../src-tauri/chat-policy.json' with { type: 'json' };
import type { ChatContext } from './chatbotSession.ts';

const moduleFaqs: Record<string, string[]> = {
  rename: ['rename', 'scan', 'merge', 'backup'], count: ['count'], translation: ['translation'],
  signature: ['signature'], copies: ['copies'], word: ['word-recent', 'word-shortcuts', 'word-multiple-files', 'word-documents'], settings: ['settings'],
};
function oneEditAway(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  if (a.length === b.length) {
    const different = Array.from(a).map((char, index) => char === b[index] ? -1 : index).filter(index => index >= 0);
    return different.length === 1 || (different.length === 2 && different[1] === different[0] + 1 && a[different[0]] === b[different[1]] && a[different[1]] === b[different[0]]);
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let left = 0, right = 0, skipped = false;
  while (left < shorter.length && right < longer.length) {
    if (shorter[left] === longer[right]) { left++; right++; continue; }
    if (skipped) return false;
    skipped = true; right++;
  }
  return true;
}
function scoreFaq(words: string[], padded: string, faqId: string, terms: string[], selector?: string, allowTypos = false) {
  const exact = terms.reduce((sum, term) => {
    const parts = term.split(' ');
    if (padded.includes(` ${term} `)) return sum + parts.length * 2;
    return parts.every(part => words.includes(part)) ? sum + parts.length : sum;
  }, 0);
  const score = exact || (allowTypos ? terms.reduce((sum, term) => {
    const parts = term.split(' ');
    const matches = parts.map(part => words.includes(part) ? 2 : words.some(word => oneEditAway(part, word)) ? 1 : 0);
    return matches.every(Boolean) && matches.includes(1) ? sum + parts.length + 0.25 : sum;
  }, 0) : 0);
  return score + (selector && moduleFaqs[selector]?.includes(faqId) ? 1 : 0);
}
function rankFaqs(question: string, selector?: string) {
  const words = normalizeQuestion(question).split(' ').filter(Boolean), padded = ` ${words.join(' ')} `;
  const exact = indexedFaqs.map(({ faq, terms }) => ({ faq, score: scoreFaq(words, padded, faq.id, terms, selector) }));
  return exact.some(item => item.score >= 2) ? exact.sort((a, b) => b.score - a.score)
    : indexedFaqs.map(({ faq, terms }) => ({ faq, score: scoreFaq(words, padded, faq.id, terms, selector, true) })).sort((a, b) => b.score - a.score);
}
function refersToPreviousTopic(question: string) {
  return /\b(more|again|that|it|those|them|why|continue|further)\b/.test(normalizeQuestion(question)) || /\b(con nua|giai thich them|nhu vay|cai do|no nua)\b/.test(normalizeQuestion(question));
}

export function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/\u0111/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
const indexedFaqs = faqs.map(faq => ({ faq, terms: faq.terms.map(normalizeQuestion) }));

export function blockedQuestion(value: string) {
  const normalized = normalizeQuestion(value);
  return policy.blockedPatterns.some(pattern => new RegExp(pattern).test(normalized));
}

const copiesFields: Record<string, Record<ChatLanguage, string>> = {
  quantity: { EN: 'Number of originals is required and must be a whole number. The form accepts digits only and rejects values outside the safe integer range.', VI: 'Số bản chính là bắt buộc và phải là số nguyên. Biểu mẫu chỉ nhận chữ số và từ chối số vượt quá giới hạn số nguyên an toàn.' },
  unitPrice: { EN: 'Certified copies is required and must be a whole number. The form accepts digits only and rejects values outside the safe integer range.', VI: 'Số bản sao chứng thực là bắt buộc và phải là số nguyên. Biểu mẫu chỉ nhận chữ số và từ chối số vượt quá giới hạn số nguyên an toàn.' },
  totalAmount: { EN: 'Total Amount is calculated and read-only unless Manual total is enabled. A manually entered total must be a non-negative whole number within the safe integer range.', VI: 'Thành tiền được tính tự động và chỉ đọc trừ khi bật Thành tiền thủ công. Thành tiền nhập thủ công phải là số nguyên không âm trong giới hạn an toàn.' },
  refNo: { EN: 'Ref. No. is generated automatically unless Custom Ref. No. is enabled. A custom reference must contain digits and be unique in the sheet.', VI: 'Số tham chiếu được tạo tự động trừ khi bật Số tham chiếu tùy chỉnh. Số tùy chỉnh chỉ gồm chữ số và phải duy nhất trong trang tính.' },
  customer: { EN: 'Customer is required. The field accepts up to 20,000 characters.', VI: 'Khách hàng là trường bắt buộc. Trường này nhận tối đa 20.000 ký tự.' },
  description: { EN: 'Description is required. The field accepts up to 20,000 characters.', VI: 'Mô tả là trường bắt buộc. Trường này nhận tối đa 20.000 ký tự.' },
};

export function answerQuestion(question: string, language: ChatLanguage, context?: ChatContext) {
  const words = normalizeQuestion(question).split(' ').filter(Boolean);
  const padded = ` ${words.join(' ')} `;
  const ranked = rankFaqs(question, context?.selector);
  const [first, second] = ranked;
  const asksAboutCurrentField = /\b(this|here|input|field|invalid|enter|type|why|what)\b/.test(padded) || /\b(nay|day|o nay|truong nay|nhap gi|loi|khong hop le)\b/.test(padded);
  if (context?.selector === 'copies' && asksAboutCurrentField) {
    if (context.fieldId && copiesFields[context.fieldId]) return { answer: copiesFields[context.fieldId][language], faq: 'copies' };
    if (context.validationCode === 'copiesNumbersInvalid') return { answer: language === 'VI'
      ? 'B6H báo lỗi số liệu trong biểu mẫu Bản sao: số tham chiếu, số lượng, số bản sao và thành tiền phải là số nguyên hợp lệ; số tham chiếu phải duy nhất trong trang tính. Bạn đang thấy lỗi ở trường nào?'
      : 'B6H reported an invalid number in the Copies form: reference number, quantity, number of copies, and total amount must be valid whole numbers; reference numbers must be unique within the sheet. Which field shows the error?', faq: 'copies' };
    return { answer: language === 'VI' ? 'Tôi chưa xác định được trường đang nói tới. Bạn đang nhập ở trường nào trong Bản sao?' : 'I can’t identify the field from the current context. Which Copies field are you using?', faq: null };
  }
  const asksAboutError = /\b(error|fail|failed|failure|problem|unexpected|lỗi|loi|that bai|khong duoc)\b/.test(padded);
  if (context?.validationCode === 'signatureHeaderInvalid' && (asksAboutError || asksAboutCurrentField)) return { answer: language === 'VI'
    ? 'Chứng thực chữ ký yêu cầu tiêu đề cột phải duy nhất trước khi xuất sổ. Kiểm tra các tiêu đề đang dùng để tìm tiêu đề trùng.'
    : 'Signature authentication requires table headers to be unique before exporting. Check the current headers for duplicates.', faq: 'signature' };
  if (asksAboutError && context?.validationCode === 'copiesNumbersInvalid') return { answer: language === 'VI'
    ? 'B6H báo lỗi số liệu trong biểu mẫu Bản sao: số tham chiếu, số lượng, số bản sao và thành tiền phải là số nguyên hợp lệ; số tham chiếu phải duy nhất trong trang tính. Bạn đang thấy lỗi ở trường nào?'
    : 'B6H reported an invalid number in the Copies form: reference number, quantity, number of copies, and total amount must be valid whole numbers; reference numbers must be unique within the sheet. Which field shows the error?', faq: 'copies' };
  if (asksAboutError && context?.errorCode) {
    const diagnostics: Record<string, Record<ChatLanguage, string>> = {
      access_error: { EN: 'The app reported that it could not access the selected file or folder. This identifies the reported error class, not its cause. Check that the workbook is closed in other apps and that the folder is accessible, then retry.', VI: 'Ứng dụng báo không thể truy cập tệp hoặc thư mục đã chọn. Đây là loại lỗi được báo, chưa xác định nguyên nhân. Kiểm tra sổ không mở trong ứng dụng khác và thư mục có thể truy cập, rồi thử lại.' },
      file_not_found: { EN: 'The app reported that a selected file or folder could not be found. Recheck the selected location and choose it again if needed.', VI: 'Ứng dụng báo không tìm thấy tệp hoặc thư mục đã chọn. Kiểm tra lại vị trí và chọn lại nếu cần.' },
      workbook_format_error: { EN: 'The app could not read the selected workbook. Check that it is a valid .xlsx file and select it again. The exact cause is not available to the chatbot.', VI: 'Ứng dụng không đọc được sổ tính đã chọn. Kiểm tra đây là tệp .xlsx hợp lệ và chọn lại. Chatbot không nhận được nguyên nhân cụ thể.' },
      ipc_error: { EN: 'The app reported that its desktop operation did not complete. Note which action failed and the exact message shown; the chatbot cannot infer the cause from this code alone.', VI: 'Ứng dụng báo thao tác trên máy tính không hoàn tất. Ghi lại thao tác và thông báo chính xác; chatbot không thể suy ra nguyên nhân chỉ từ mã này.' },
      online_error: { EN: 'The online help request failed. Your local chat remains saved; switch to Offline for the built-in answer and check the connection before trying Online again.', VI: 'Yêu cầu trợ giúp trực tuyến thất bại. Trò chuyện cục bộ vẫn được lưu; chuyển sang Ngoại tuyến để xem câu trả lời có sẵn và kiểm tra kết nối trước khi thử lại.' },
      validation_error: { EN: 'The app reported that an existing validation rule rejected the input. I do not have the specific field or rule here. Which field and exact message do you see?', VI: 'Ứng dụng báo dữ liệu không đáp ứng quy tắc kiểm tra hiện có. Tôi chưa có trường hoặc quy tắc cụ thể. Bạn thấy trường nào và thông báo chính xác nào?' },
      operation_error: { EN: 'B6H reported an error during this operation, but the available diagnostic does not identify its cause. Which action failed, and what exact message is shown?', VI: 'B6H báo lỗi khi thực hiện thao tác này nhưng dữ liệu chẩn đoán hiện có chưa xác định nguyên nhân. Thao tác nào thất bại và thông báo chính xác là gì?' },
    };
    return { answer: diagnostics[context.errorCode]?.[language] ?? diagnostics.operation_error[language], faq: null };
  }
  if ((!first || first.score < 2 || first.score - (second?.score ?? 0) < 2) && context?.previousFaqId && refersToPreviousTopic(question)) {
    const previous = faqs.find(faq => faq.id === context.previousFaqId);
    if (previous) return { answer: previous.answer[language], faq: previous.id };
  }
  if (!first || first.score < 2 || first.score - (second?.score ?? 0) < 2) return { answer: language === 'VI' ? 'Bạn muốn hỏi về tính năng nào? Hãy chọn một câu hỏi bên dưới hoặc nói rõ hơn.' : 'Which feature do you mean? Choose a question below or add more detail.', faq: null };
  return { answer: first.faq.answer[language], faq: first.faq.id };
}

export function relevantFaqIds(question: string, context?: ChatContext) {
  if (context?.selector === 'copies' && (context.fieldId || context.validationCode)) return ['copies'];
  if (context?.selector === 'signature' && context.validationCode === 'signatureHeaderInvalid') return ['signature'];
  const ranked = rankFaqs(question, context?.selector), [first, second] = ranked;
  const confident = first && first.score >= 2 && first.score - (second?.score ?? 0) >= 2;
  const ids = confident ? ranked.filter(item => item.score > 0).slice(0, 3).map(item => item.faq.id) : [];
  if (context?.previousFaqId && refersToPreviousTopic(question) && faqs.some(faq => faq.id === context.previousFaqId)) return [context.previousFaqId, ...ids.filter(id => id !== context.previousFaqId)].slice(0, 3);
  return ids;
}
