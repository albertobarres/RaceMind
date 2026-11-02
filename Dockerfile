FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/RaceMind.Api/RaceMind.Api.csproj --configuration Release --output /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:10000
ENV ASPNETCORE_ENVIRONMENT=Production
ENV TelemetryArchive__DownloadEnabled=false
ENV Authentication__UserStorePath=/var/data/users.json
ENV DataProtection__KeysPath=/var/data/keys
EXPOSE 10000
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "RaceMind.Api.dll"]
