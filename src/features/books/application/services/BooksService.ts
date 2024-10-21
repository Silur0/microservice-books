import { Repository, createQueryBuilder } from "typeorm";

import { AppDataSource } from "../../../../lib/database/Database";
import { Book } from "../../dal/Entities/Book";
import { CreateBookRequest } from "../contracts/requests/CreateBookRequest";
import EntityNotFoundError from "../../../../lib/errors/EntityNotFoundError";
import ExistingBookWithISBNError from "../errors/ExistingBookWithISBNError";
import GenerateSummaryError from "../errors/GenerateSummaryError";
import { LanguageResponse } from "../contracts/responses/LanguageResponse";
import { Logger } from "../../../../lib/logger/Logger";
import { OpenAI } from "openai";
import { PaginatedResponse } from "../../../../lib/api/PaginatedResponse";
import { PublicationYearResponse } from "../contracts/responses/PublicationYearResponse";
import RequiredFieldError from "../../../../lib/errors/RequiredFieldError";
import { UpdateBookRequest } from "../contracts/requests/UpdateBookRequest";

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

    async getPublicationYears(): Promise<
        PaginatedResponse<PublicationYearResponse>
    > {
        let result = await this.booksRepo
            .createQueryBuilder("book")
            .select("book.publicationYear", "year")
            .distinct(true)
            .getRawMany();

        let resultSorted = result.sort(
            (a, b) => Number(b.year) - Number(a.year)
        );

        return new PaginatedResponse<PublicationYearResponse>({
            page: 1,
            count: result.length,
            total: result.length,
            items: resultSorted,
        });
    }

    async getLanguages(): Promise<PaginatedResponse<LanguageResponse>> {
        let result = await this.booksRepo
            .createQueryBuilder("book")
            .select("book.language", "language")
            .distinct(true)
            .getRawMany();

        let resultSorted = result.sort();

        return new PaginatedResponse<LanguageResponse>({
            page: 1,
            count: result.length,
            total: result.length,
            items: resultSorted,
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

        if (!req.author) {
            throw new RequiredFieldError("Author");
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
        book.author = req.author;
        book.publicationYear = req.publicationYear;
        book.language = req.language;
        book.summary = summary!;

        return await this.booksRepo.save(book);
    }

    async update(id: string, req: UpdateBookRequest): Promise<Book> {
        let numId = Number(id);

        if (Number.isNaN(numId)) {
            throw new RequiredFieldError("Id");
        }

        let book = await this.booksRepo.findOneBy({
            id: numId,
        });

        if (book == null) {
            throw new EntityNotFoundError("Book", id);
        }

        book.isbn = req.isbn ?? book.isbn;
        book.title = req.title ?? book.title;
        book.author = req.author ?? book.author;
        book.publicationYear = req.publicationYear ?? book.publicationYear;
        book.language = req.language ?? book.language;

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
