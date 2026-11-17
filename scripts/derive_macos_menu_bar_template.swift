import AppKit
import CryptoKit

guard CommandLine.arguments.count == 3 else {
    fatalError("Usage: swift derive_macos_menu_bar_template.swift <white-source-directory> <new-output-directory>")
}
let sourceDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: false)
var results = [[String: Any]]()
for (suffix, size) in [("", 18), ("@2x", 36)] {
    let source = sourceDirectory.appendingPathComponent("ameow-menu-bar-white\(suffix).png")
    guard let bitmap = NSBitmapImageRep(data: try Data(contentsOf: source)),
          bitmap.pixelsWide == size, bitmap.pixelsHigh == size,
          bitmap.bitsPerSample == 8, bitmap.samplesPerPixel == 4,
          bitmap.hasAlpha, !bitmap.isPlanar, !bitmap.bitmapFormat.contains(.alphaFirst),
          let template = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
              bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
              colorSpaceName: .deviceRGB, bitmapFormat: .alphaNonpremultiplied,
              bytesPerRow: size * 4, bitsPerPixel: 32) else {
        fatalError("Expected approved RGBA source at \(size) pixels")
    }
    var alpha = [UInt8]()
    for vertical in 0..<size {
        for horizontal in 0..<size {
            var pixel = [UInt](repeating: 0, count: 4)
            bitmap.getPixel(&pixel, atX: horizontal, y: vertical)
            if pixel[3] > 0 {
                guard let color = bitmap.colorAt(x: horizontal, y: vertical)?.usingColorSpace(.deviceRGB),
                      color.redComponent >= 0.999, color.greenComponent >= 0.999, color.blueComponent >= 0.999 else {
                    fatalError("Visible source pixels must remain white")
                }
            }
            alpha.append(UInt8(pixel[3]))
            pixel[0] = 0
            pixel[1] = 0
            pixel[2] = 0
            template.setPixel(&pixel, atX: horizontal, y: vertical)
        }
    }
    guard alpha.min() == 0, alpha.max() == 255,
          let data = template.representation(using: .png, properties: [:]) else {
        fatalError("Expected transparent background and opaque artwork")
    }
    let destination = outputDirectory.appendingPathComponent("ameow-menu-bar-template\(suffix).png")
    try data.write(to: destination, options: .withoutOverwriting)
    results.append(["size": size, "alphaValues": Set(alpha).count,
        "alphaSHA256": SHA256.hash(data: Data(alpha)).map { String(format: "%02x", $0) }.joined(),
        "outputSHA256": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()])
}
print(String(data: try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
