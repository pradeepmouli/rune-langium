package org.isda.cdm.generators;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.inject.Injector;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.xtext.resource.XtextResourceSet;

import com.regnosys.rosetta.generator.external.AbstractExternalGenerator;
import com.regnosys.rosetta.generator.external.ExternalGenerator;
import com.regnosys.rosetta.generator.external.ExternalGenerators;
import com.regnosys.rosetta.rosetta.RosettaModel;

/**
 * Thin CLI wrapper for rosetta-code-generators.
 *
 * Modes:
 *   --list-languages                    Print available generators as JSON to stdout
 *   --language <id> --input <dir> --output <dir>   Generate code
 *   --json                              Read JSON request from stdin, write JSON response to stdout
 *
 * The --json mode accepts the same format as codegen-api.md:
 *   stdin:  {"language":"typescript","files":[{"path":"model.rosetta","content":"..."}]}
 *   stdout: {"files":[{"path":"...","content":"..."}],"errors":[],"warnings":[]}
 */
public class CodegenCli {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Injector injector;
    private final Map<String, AbstractExternalGenerator> generatorsByName;

    public CodegenCli() {
        CDMRosettaSetup setup = new CDMRosettaSetup();
        this.injector = setup.createInjectorAndDoEMFRegistration();

        DefaultExternalGeneratorsProvider provider = injector.getInstance(DefaultExternalGeneratorsProvider.class);
        ExternalGenerators generators = provider.get();

        this.generatorsByName = new LinkedHashMap<>();
        for (ExternalGenerator gen : generators) {
            if (gen instanceof AbstractExternalGenerator) {
                AbstractExternalGenerator aeg = (AbstractExternalGenerator) gen;
                String name = aeg.getClass().getSimpleName()
                        .replace("CodeGenerator", "")
                        .replace("Generator", "");
                generatorsByName.put(name.toLowerCase(), aeg);
            }
        }
    }

    private AbstractExternalGenerator findGenerator(String language) {
        AbstractExternalGenerator gen = generatorsByName.get(language.toLowerCase());
        if (gen != null) return gen;

        String normalized = language.toLowerCase().replace("-", "").replace("_", "");
        gen = generatorsByName.get(normalized);
        if (gen != null) return gen;

        for (Map.Entry<String, AbstractExternalGenerator> entry : generatorsByName.entrySet()) {
            if (entry.getKey().contains(normalized) || normalized.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }

    private RosettaModel loadRosetta(String fileName, String content, ResourceSet resourceSet) throws IOException {
        // Use .rosetta extension so Xtext's resource factory is matched
        String safeName = fileName.endsWith(".rosetta") ? fileName : fileName + ".rosetta";
        URI uri = URI.createURI("synthetic:/" + safeName);
        Resource resource = resourceSet.createResource(uri);
        if (resource == null) {
            throw new IOException("No resource factory registered for: " + uri);
        }
        resource.load(new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)), null);
        if (resource.getContents().isEmpty()) {
            return null;
        }
        return (RosettaModel) resource.getContents().get(0);
    }

    /** --list-languages: print JSON to stdout */
    private int listLanguages() throws IOException {
        ObjectNode response = MAPPER.createObjectNode();
        ArrayNode languages = response.putArray("languages");
        for (Map.Entry<String, AbstractExternalGenerator> entry : generatorsByName.entrySet()) {
            ObjectNode lang = languages.addObject();
            lang.put("id", entry.getKey());
            lang.put("class", entry.getValue().getClass().getSimpleName());
        }
        System.out.println(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(response));
        return 0;
    }

    /** --json mode: read JSON from stdin, write JSON to stdout */
    private int jsonMode() throws IOException {
        String input = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        JsonNode request = MAPPER.readTree(input);

        String language = request.has("language") ? request.get("language").asText() : null;
        if (language == null || language.isBlank()) {
            writeError("Missing required field: language");
            return 1;
        }

        JsonNode filesNode = request.get("files");
        if (filesNode == null || !filesNode.isArray() || filesNode.isEmpty()) {
            writeError("Missing or empty 'files' array");
            return 1;
        }

        AbstractExternalGenerator generator = findGenerator(language);
        if (generator == null) {
            writeError("Unknown language: " + language + ". Available: " + generatorsByName.keySet());
            return 1;
        }

        ObjectNode result = generate(generator, filesNode);
        System.out.println(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(result));

        return result.get("errors").isEmpty() ? 0 : 1;
    }

    /** --language/--input/--output mode: read files from disk, write to disk */
    private int fileMode(String language, String inputDir, String outputDir) throws IOException {
        AbstractExternalGenerator generator = findGenerator(language);
        if (generator == null) {
            System.err.println("Unknown language: " + language + ". Available: " + generatorsByName.keySet());
            return 1;
        }

        // Discover .rosetta files
        Path inputPath = Path.of(inputDir);
        if (!Files.exists(inputPath)) {
            System.err.println("Input path does not exist: " + inputDir);
            return 2;
        }

        ArrayNode filesNode = MAPPER.createArrayNode();
        List<Path> rosettaFiles = Files.walk(inputPath)
                .filter(p -> p.toString().endsWith(".rosetta"))
                .toList();

        if (rosettaFiles.isEmpty()) {
            System.err.println("No .rosetta files found in: " + inputDir);
            return 2;
        }

        for (Path file : rosettaFiles) {
            ObjectNode fileNode = filesNode.addObject();
            fileNode.put("path", inputPath.relativize(file).toString());
            fileNode.put("content", Files.readString(file, StandardCharsets.UTF_8));
        }

        ObjectNode result = generate(generator, filesNode);

        // Write output files
        Path outPath = Path.of(outputDir);
        Files.createDirectories(outPath);

        int written = 0;
        for (JsonNode fileNode : result.get("files")) {
            String path = fileNode.get("path").asText();
            String content = fileNode.get("content").asText();
            Path dest = outPath.resolve(path);
            Files.createDirectories(dest.getParent());
            Files.writeString(dest, content, StandardCharsets.UTF_8);
            written++;
        }

        // Output summary as JSON to stdout
        ObjectNode summary = MAPPER.createObjectNode();
        summary.put("language", language);
        summary.put("filesGenerated", written);
        summary.set("errors", result.get("errors"));
        summary.set("warnings", result.get("warnings"));
        System.out.println(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(summary));

        return result.get("errors").isEmpty() ? 0 : 1;
    }

    /** Core generation logic shared by both modes */
    private ObjectNode generate(AbstractExternalGenerator generator, JsonNode filesNode) {
        XtextResourceSet resourceSet = injector.getInstance(XtextResourceSet.class);
        Map<String, CharSequence> allGenerated = new LinkedHashMap<>();
        ArrayNode errors = MAPPER.createArrayNode();
        List<RosettaModel> models = new ArrayList<>();

        for (JsonNode fileNode : filesNode) {
            String path = fileNode.has("path") ? fileNode.get("path").asText() : "model.rosetta";
            String content = fileNode.has("content") ? fileNode.get("content").asText() : "";

            try {
                RosettaModel model = loadRosetta(path, content, resourceSet);
                if (model != null) {
                    models.add(model);
                }
            } catch (Exception e) {
                ObjectNode err = MAPPER.createObjectNode();
                err.put("sourceFile", path);
                err.put("construct", "");
                err.put("message", e.getMessage() != null ? e.getMessage() : e.getClass().getName());
                errors.add(err);
            }
        }

        String version = models.isEmpty() ? "" : (models.get(0).getVersion() != null ? models.get(0).getVersion() : "");

        try {
            allGenerated.putAll(generator.beforeAllGenerate(resourceSet, models, version));
        } catch (Exception e) {
            addError(errors, "", "beforeAllGenerate", e);
        }

        for (RosettaModel model : models) {
            try {
                allGenerated.putAll(generator.beforeGenerate(model.eResource(), model, version));
                allGenerated.putAll(generator.generate(model.eResource(), model, version));
                allGenerated.putAll(generator.afterGenerate(model.eResource(), model, version));
            } catch (Exception e) {
                addError(errors, model.getName() != null ? model.getName() : "", "", e);
            }
        }

        try {
            allGenerated.putAll(generator.afterAllGenerate(resourceSet, models, version));
        } catch (Exception e) {
            addError(errors, "", "afterAllGenerate", e);
        }

        ObjectNode response = MAPPER.createObjectNode();
        ArrayNode filesArray = response.putArray("files");
        for (Map.Entry<String, CharSequence> entry : allGenerated.entrySet()) {
            ObjectNode file = filesArray.addObject();
            file.put("path", entry.getKey());
            file.put("content", entry.getValue().toString());
        }
        response.set("errors", errors);
        response.putArray("warnings");

        return response;
    }

    private static void addError(ArrayNode errors, String sourceFile, String construct, Exception e) {
        ObjectNode err = new ObjectMapper().createObjectNode();
        err.put("sourceFile", sourceFile);
        err.put("construct", construct);
        err.put("message", e.getMessage() != null ? e.getMessage() : e.getClass().getName());
        errors.add(err);
    }

    private static void writeError(String message) throws IOException {
        ObjectNode error = MAPPER.createObjectNode();
        error.put("error", message);
        error.putArray("files");
        ArrayNode errors = error.putArray("errors");
        ObjectNode err = errors.addObject();
        err.put("sourceFile", "");
        err.put("construct", "");
        err.put("message", message);
        error.putArray("warnings");
        System.out.println(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(error));
    }

    private static void printUsage() {
        System.err.println("Usage:");
        System.err.println("  codegen-cli --list-languages");
        System.err.println("  codegen-cli --json                               (read JSON from stdin)");
        System.err.println("  codegen-cli --language <id> --input <dir> --output <dir>");
        System.err.println();
        System.err.println("The --json mode reads a JSON request from stdin and writes JSON to stdout.");
        System.err.println("Request format: {\"language\":\"...\",\"files\":[{\"path\":\"...\",\"content\":\"...\"}]}");
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            printUsage();
            System.exit(2);
        }

        // Parse args
        boolean listLangs = false;
        boolean jsonMode = false;
        String language = null;
        String inputDir = null;
        String outputDir = null;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--list-languages":
                    listLangs = true;
                    break;
                case "--json":
                    jsonMode = true;
                    break;
                case "--language":
                case "-l":
                    if (i + 1 < args.length) language = args[++i];
                    break;
                case "--input":
                case "-i":
                    if (i + 1 < args.length) inputDir = args[++i];
                    break;
                case "--output":
                case "-o":
                    if (i + 1 < args.length) outputDir = args[++i];
                    break;
                default:
                    System.err.println("Unknown option: " + args[i]);
                    printUsage();
                    System.exit(2);
            }
        }

        // Stderr for init progress (stdout reserved for JSON output)
        System.err.println("Initializing rosetta-code-generators...");
        CodegenCli cli = new CodegenCli();
        System.err.println("Ready. Generators: " + cli.generatorsByName.keySet());

        int exitCode;
        if (listLangs) {
            exitCode = cli.listLanguages();
        } else if (jsonMode) {
            exitCode = cli.jsonMode();
        } else if (language != null && inputDir != null && outputDir != null) {
            exitCode = cli.fileMode(language, inputDir, outputDir);
        } else {
            printUsage();
            exitCode = 2;
        }

        System.exit(exitCode);
    }
}
