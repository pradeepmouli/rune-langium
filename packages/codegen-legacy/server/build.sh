#!/usr/bin/env bash
# Build the codegen CLI wrapper against rosetta-code-generators classpath.
# Prerequisites: rosetta-code-generators must be built first (mvn package -DskipTests)
#
# Usage: ./build.sh [path-to-rosetta-code-generators]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN_REPO="${1:-$(cd "$SCRIPT_DIR/../../../../rosetta-code-generators" 2>/dev/null && pwd)}"
JAVA_HOME="${JAVA21_HOME:-${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}}"

if [ ! -d "$CODEGEN_REPO" ]; then
  echo "Error: rosetta-code-generators not found at $CODEGEN_REPO"
  echo "Clone it: git clone https://github.com/REGnosys/rosetta-code-generators.git ../rosetta-code-generators"
  exit 1
fi

CDM_JAR="$CODEGEN_REPO/default-cdm-generators/target/default-cdm-generators-0.0.0.main-SNAPSHOT.jar"
if [ ! -f "$CDM_JAR" ]; then
  echo "Error: default-cdm-generators JAR not found. Build it first:"
  echo "  cd $CODEGEN_REPO && JAVA_HOME=$JAVA_HOME mvn package -DskipTests -pl default-cdm-generators -am"
  exit 1
fi

# Get classpath from Maven
echo "Resolving classpath from Maven..."
CLASSPATH=$(cd "$CODEGEN_REPO" && JAVA_HOME="$JAVA_HOME" mvn dependency:build-classpath -pl default-cdm-generators -q -DincludeScope=compile -Dmdep.outputFile=/dev/stdout 2>/dev/null)
CLASSPATH="$CDM_JAR:$CLASSPATH"

# Compile
echo "Compiling CodegenCli.java..."
OUTDIR="$SCRIPT_DIR/target/classes"
mkdir -p "$OUTDIR"
"$JAVA_HOME/bin/javac" \
  -cp "$CLASSPATH" \
  -d "$OUTDIR" \
  --add-exports jdk.httpserver/com.sun.net.httpserver=ALL-UNNAMED \
  "$SCRIPT_DIR/src/org/isda/cdm/generators/CodegenCli.java"

# Create a launcher script
echo "Creating launcher..."
cat > "$SCRIPT_DIR/target/codegen-cli.sh" <<LAUNCHER
#!/usr/bin/env bash
JAVA_HOME="\${JAVA21_HOME:-\${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}}"
exec "\$JAVA_HOME/bin/java" -cp "$OUTDIR:$CLASSPATH" org.isda.cdm.generators.CodegenCli "\$@"
LAUNCHER
chmod +x "$SCRIPT_DIR/target/codegen-cli.sh"

echo "Build complete."
echo "  Classes: $OUTDIR"
echo "  Launcher: $SCRIPT_DIR/target/codegen-cli.sh"
echo ""
echo "Test it:"
echo "  $SCRIPT_DIR/target/codegen-cli.sh --list-languages"
