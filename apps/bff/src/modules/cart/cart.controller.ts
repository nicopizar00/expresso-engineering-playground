import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionService } from "../../core/session/session.service";
import { AddCartItemDto, UpdateCartItemDto } from "./cart.dto";
import { CartService } from "./cart.service";
import type { Cart } from "./cart.types";

@Controller("cart")
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly session: SessionService,
  ) {}

  @Get()
  get(@Req() req: Request, @Res({ passthrough: true }) res: Response): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.get(sessionId);
  }

  @Post("items")
  @HttpCode(201)
  addItem(
    @Body() body: AddCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.add(sessionId, body);
  }

  @Patch("items/:itemId")
  updateItem(
    @Param("itemId") itemId: string,
    @Body() body: UpdateCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.updateQuantity(sessionId, itemId, body.quantity);
  }

  @Delete("items/:itemId")
  removeItem(
    @Param("itemId") itemId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.remove(sessionId, itemId);
  }
}
