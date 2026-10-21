using System.Globalization;
using System.Text;
using OrderApi.Dtos;

namespace OrderApi.Services;

// Builds the CSV for the orders export (RFC 4180 quoting, CRLF line endings).
public static class OrderCsv
{
    private static readonly string[] Header =
        ["Order", "Status", "Customer", "Items", "Total", "Created (UTC)", "Updated (UTC)"];

    public static string Build(IEnumerable<OrderListItemResponse> orders)
    {
        var csv = new StringBuilder();
        csv.Append(string.Join(',', Header)).Append("\r\n");

        foreach (var order in orders)
        {
            string[] cells =
            [
                order.Id.ToString(CultureInfo.InvariantCulture),
                order.Status.ToString(),
                order.CustomerEmail ?? "",
                order.ItemCount.ToString(CultureInfo.InvariantCulture),
                order.TotalAmount.ToString("0.00", CultureInfo.InvariantCulture),
                order.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                order.UpdatedAt.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
            ];
            csv.Append(string.Join(',', cells.Select(Cell))).Append("\r\n");
        }

        return csv.ToString();
    }

    // Escapes one value for a CSV cell.
    public static string Cell(string value)
    {
        // Spreadsheet programs run text that starts with these characters as a formula (CSV injection),
        // for example a customer email such as "=HYPERLINK(...)". A leading apostrophe keeps it plain text.
        if (value.Length > 0 && value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
            value = "'" + value;

        return value.IndexOfAny([',', '"', '\r', '\n']) >= 0
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }
}
