
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY OrderApi.csproj ./
RUN dotnet restore

COPY . .
RUN dotnet publish OrderApi.csproj -c Release -o /app/publish --no-restore

#runtime stage 
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080

# Uploaded product pictures live in a volume (see docker-compose.yml). The folder is created here and handed to
# the non-root user, so a new volume starts out writable.
ENV Storage__ProductImagesPath=/data/product-images
RUN mkdir -p /data/product-images && chown -R $APP_UID /data
EXPOSE 8080

# Run as the non-root user that ships with the official .NET images
USER $APP_UID

ENTRYPOINT ["dotnet", "OrderApi.dll"]
