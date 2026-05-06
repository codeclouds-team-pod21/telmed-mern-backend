import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductVariantService } from './product-variant.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, ProductVariantService],
  exports: [ProductService, ProductVariantService],
})
export class ProductModule {}
