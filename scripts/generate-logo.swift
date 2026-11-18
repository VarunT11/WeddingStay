// Deterministic logo asset export. The original artwork is never redrawn.
// Run from the project root: swift scripts/generate-logo.swift
import Foundation
import CoreGraphics
import ImageIO

enum LogoError: Error { case source, crop, context, export }
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let original = root.appendingPathComponent("WhatsApp Image 2026-09-15 at 16.29.56.jpeg")
let publicDirectory = root.appendingPathComponent("public", isDirectory: true)
guard let source = CGImageSourceCreateWithURL(original as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw LogoError.source }

// Coordinates in the supplied 1254px artwork: retain PH and its central lotus.
// Scaling the coordinates keeps the export usable with an equivalent larger source.
let scale = CGFloat(image.width) / 1254
let cropRect = CGRect(x: 450 * scale, y: 480 * scale, width: 330 * scale, height: 250 * scale).integral
guard let monogram = image.cropping(to: cropRect) else { throw LogoError.crop }
let colourSpace = CGColorSpaceCreateDeviceRGB()

// Sample the original corner so the square padding matches the image's ivory.
var sample = [UInt8](repeating: 0, count: 4)
sample.withUnsafeMutableBytes { buffer in
    if let context = CGContext(data: buffer.baseAddress, width: 1, height: 1,
                               bitsPerComponent: 8, bytesPerRow: 4, space: colourSpace,
                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    }
}
let ivory = CGColor(red: CGFloat(sample[0]) / 255, green: CGFloat(sample[1]) / 255,
                   blue: CGFloat(sample[2]) / 255, alpha: 1)

func export(_ name: String, size: Int, contentFraction: CGFloat = 0.84) throws {
    guard let context = CGContext(data: nil, width: size, height: size,
                                  bitsPerComponent: 8, bytesPerRow: size * 4, space: colourSpace,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { throw LogoError.context }
    let canvas = CGFloat(size)
    context.setFillColor(ivory)
    context.fill(CGRect(x: 0, y: 0, width: canvas, height: canvas))
    context.interpolationQuality = .high
    let width = canvas * contentFraction
    let height = width * CGFloat(monogram.height) / CGFloat(monogram.width)
    context.draw(monogram, in: CGRect(x: (canvas - width) / 2, y: (canvas - height) / 2,
                                     width: width, height: height))
    guard let output = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(publicDirectory.appendingPathComponent(name) as CFURL,
                                                           "public.png" as CFString, 1, nil) else { throw LogoError.export }
    CGImageDestinationAddImage(destination, output, nil)
    guard CGImageDestinationFinalize(destination) else { throw LogoError.export }
}

try Data(contentsOf: original).write(to: publicDirectory.appendingPathComponent("wedding-logo.jpeg"))
try export("ph-monogram.png", size: 512)
try export("ph-favicon-32.png", size: 32, contentFraction: 0.92)
try export("ph-favicon-64.png", size: 64, contentFraction: 0.92)
try export("ph-icon-192.png", size: 192)
try export("ph-icon-512.png", size: 512)
// A 330:250 rectangle at 62% width fits inside the central 80% safe circle.
try export("ph-icon-maskable.png", size: 512, contentFraction: 0.62)
try export("ph-apple-touch-icon.png", size: 180)
print("Exported the wedding badge and PH logo assets to public/.")
