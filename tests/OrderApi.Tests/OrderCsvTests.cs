using System.Globalization;
using OrderApi.Domain;
using OrderApi.Dtos;
using OrderApi.Services;

namespace OrderApi.Tests;

// Pure unit tests: no database or server needed.
public class OrderCsvTests
{
    [Theory]
    [InlineData("plain", "plain")]
    [InlineData("", "")]
    [InlineData("a,b", "\"a,b\"")]
    [InlineData("say \"hi\"", "\"say \"\"hi\"\"\"")]
    [InlineData("two\nlines", "\"two\nlines\"")]
    public void Cells_are_quoted_only_when_needed(string value, string expected)
    {
        Assert.Equal(expected, OrderCsv.Cell(value));
    }

    [Theory]
    [InlineData("=SUM(A1:A9)")]
    [InlineData("+1")]
    [InlineData("-1")]
    [InlineData("@cmd")]
    [InlineData("\tindented")]
    public void Cells_that_a_spreadsheet_would_run_as_a_formula_are_made_harmless(string value)
    {
        Assert.StartsWith("'", OrderCsv.Cell(value));
    }

    [Fact]
    public void A_formula_with_a_comma_is_neutralised_and_quoted()
    {
        Assert.Equal("\"'=HYPERLINK(\"\"http://x\"\",\"\"y\"\")\"", OrderCsv.Cell("=HYPERLINK(\"http://x\",\"y\")"));
    }

    [Fact]
    public void The_csv_has_a_header_and_one_line_per_order_with_crlf_endings()
    {
        var created = new DateTime(2026, 3, 4, 5, 6, 7, DateTimeKind.Utc);
        var updated = created.AddHours(2);
        var orders = new[]
        {
            new OrderListItemResponse(7, OrderStatus.Shipped, created, updated, 2, 1234.5m, "ann@example.com"),
            new OrderListItemResponse(8, OrderStatus.Pending, created, created, 1, 9m, null),
        };

        var lines = OrderCsv.Build(orders).Split("\r\n");

        Assert.Equal("Order,Status,Customer,Items,Total,Created (UTC),Updated (UTC)", lines[0]);
        Assert.Equal("7,Shipped,ann@example.com,2,1234.50,2026-03-04 05:06:07,2026-03-04 07:06:07", lines[1]);
        Assert.Equal("8,Pending,,1,9.00,2026-03-04 05:06:07,2026-03-04 05:06:07", lines[2]);
        Assert.Equal("", lines[3]);
    }

    [Fact]
    public void Numbers_and_dates_do_not_depend_on_the_server_culture()
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("de-DE");
            var created = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);

            var csv = OrderCsv.Build([new OrderListItemResponse(1, OrderStatus.Pending, created, created, 1, 1234.5m, null)]);

            Assert.Contains(",1234.50,", csv);
            Assert.DoesNotContain("1.234,50", csv);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }
}
