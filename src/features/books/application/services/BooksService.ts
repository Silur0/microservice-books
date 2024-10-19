import { AppDataSource } from "../../../../lib/database/Database";
import { Book } from "../../dal/Entities/Book";
import { CreateBookRequest } from "../contracts/requests/CreateBookRequest";
import ExistingBookWithISBNError from "../errors/ExistingBookWithISBNError";
import GenerateSummaryError from "../errors/GenerateSummaryError";
import { Logger } from "../../../../lib/logger/Logger";
import { OpenAI } from "openai";
import { PaginatedResponse } from "../../../../lib/api/PaginatedResponse";
import { Repository } from "typeorm";
import RequiredFieldError from "../../../../lib/errors/RequiredFieldError";

const openAIService = new OpenAI();

class BooksService {
    private readonly booksRepo: Repository<Book> =
        AppDataSource.getRepository(Book);

    async get(): Promise<PaginatedResponse<Book>> {
        let result = await this.booksRepo.find();
        return new PaginatedResponse<Book>({
            page: 1,
            count: result.length,
            total: result.length,
            items: result,
        });
    }

    async create(req: CreateBookRequest): Promise<Book> {
        if (!req.isbn) {
            throw new RequiredFieldError("ISBN");
        }

        let existingBook = await this.booksRepo.findOneBy({
            isbn: req.isbn,
        });

        if (existingBook) {
            throw new ExistingBookWithISBNError();
        }

        if (!req.title) {
            throw new RequiredFieldError("Title");
        }

        if (!req.publicationYear) {
            throw new RequiredFieldError("Publication Year");
        }

        if (!req.language) {
            throw new RequiredFieldError("Language");
        }

        let summary = await this.generateSummary(req.isbn, req.title);

        let book = new Book();

        book.isbn = req.isbn;
        book.title = req.title;
        book.publicationYear = req.publicationYear;
        book.language = req.language;
        book.summary = summary!;

        return await this.booksRepo.save(book);
    }

    private async generateSummary(isbn: string, title: string) {
        try {
            let result = await openAIService.chat.completions.create({
                model: "gpt-3.5-turbo",
                temperature: 0.7,
                max_tokens: 70,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful assistant that summarizes books.",
                    },
                    {
                        role: "user",
                        content: `Write a concise 2-line summary of the book with the following details:\n\nTitle: ${title}\nISBN: ${isbn}`,
                    },
                ],
            });
            Logger.log(result, result.choices[0].message);
            return result.choices[0].message.content;
        } catch (error) {
            throw new GenerateSummaryError();
        }
    }
}

export default new BooksService();
