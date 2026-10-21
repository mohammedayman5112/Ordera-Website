using OrderApi.Data;

namespace OrderApi.Tests;

public class LikePatternTests
{
    [Theory]
    [InlineData("mouse", "%mouse%")]
    [InlineData("  padded  ", "%padded%")]
    [InlineData("50%", "%50\\%%")]
    [InlineData("a_b", "%a\\_b%")]
    [InlineData("back\\slash", "%back\\\\slash%")]
    [InlineData("%_\\", "%\\%\\_\\\\%")]
    public void User_text_is_matched_literally(string term, string expected)
    {
        Assert.Equal(expected, LikePattern.Contains(term));
    }
}
