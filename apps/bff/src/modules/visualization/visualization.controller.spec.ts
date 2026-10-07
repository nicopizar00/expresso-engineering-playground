import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import {
  METHOD_METADATA,
  PATH_METADATA,
  SSE_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { VisualizationController } from "./visualization.controller";

describe("VisualizationController routes", () => {
  it("is mounted at /visualization", () => {
    expect(Reflect.getMetadata(PATH_METADATA, VisualizationController)).toBe(
      "visualization",
    );
  });

  it("serves the snapshot at GET /visualization", () => {
    const fn = VisualizationController.prototype.list;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
  });

  it("streams SSE at GET /visualization/events", () => {
    const fn = VisualizationController.prototype.updates;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("events");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(SSE_METADATA, fn)).toBe(true);
  });
});
