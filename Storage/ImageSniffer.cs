namespace OrderApi.Storage;

public static class ImageSniffer
{
    /// <summary>The number of leading bytes needed to recognise every supported format.</summary>
    public const int HeaderLength = 12;

    private static ReadOnlySpan<byte> PngSignature => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    // Recognises JPEG, PNG and WebP from the first bytes of the file and returns the matching extension
    // (with the dot), or null for anything else. The file name and content type sent by the client are
    // never trusted: a file only counts as a picture if its content says so. SVG is deliberately not
    // supported, because an SVG can carry scripts.
    public static string? DetectExtension(ReadOnlySpan<byte> header)
    {
        if (header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
            return ".jpg";

        if (header.Length >= 8 && header[..8].SequenceEqual(PngSignature))
            return ".png";

        if (header.Length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header.Slice(8, 4).SequenceEqual("WEBP"u8))
            return ".webp";

        return null;
    }
}
